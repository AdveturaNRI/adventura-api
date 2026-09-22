import { createHash, randomBytes } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EmailTokenType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { ANALYTICS_EVENTS } from '../analytics/analytics.constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { MailService } from '../mail/mail.service';
import { MarketingAttributionService } from '../marketing/attribution/marketing-attribution.service';
import { MarketingConversionsService } from '../marketing/conversions/marketing-conversions.service';
import { NicknameService } from '../nickname/nickname.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthResponse,
  AuthUser,
  LinkedOAuthProvider,
} from './types/auth-response.type';

const SALT_ROUNDS = 10;
const EMAIL_TOKEN_TTL_MS = 60 * 60 * 1000;
const USER_SELECT = {
  id: true,
  email: true,
  nickname: true,
  isGuest: true,
  emailVerifiedAt: true,
} as const;

type UserRow = {
  id: string;
  email: string;
  nickname: string;
  isGuest: boolean;
  emailVerifiedAt: Date | null;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly nicknameService: NicknameService,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analytics: AnalyticsService,
    private readonly attribution: MarketingAttributionService,
    private readonly conversions: MarketingConversionsService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const nickname = dto.nickname.trim();

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { nickname }],
      },
      select: {
        email: true,
        nickname: true,
      },
    });

    if (existingUser?.email === email) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    if (existingUser?.nickname === nickname) {
      throw new ConflictException('Этот никнейм уже занят');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email,
        nickname,
        passwordHash,
      },
      select: USER_SELECT,
    });

    this.analytics.track({
      name: ANALYTICS_EVENTS.USER_REGISTERED,
      userId: user.id,
      props: {
        acquisition_source:
          dto.acquisitionSource?.trim().slice(0, 64) || 'direct',
        is_guest: false,
      },
    });

    if (dto.anonymousId) {
      await this.attribution
        .bindAnonymousTouches(user.id, dto.anonymousId)
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to bind marketing touches after register: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    void this.conversions
      .recordConversion({
        type: 'REGISTRATION_COMPLETED',
        userId: user.id,
        anonymousId: dto.anonymousId,
        idempotencyKey: `register:${user.id}`,
        props: {
          acquisition_source:
            dto.acquisitionSource?.trim().slice(0, 64) || 'direct',
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to record marketing conversion after register: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    void this.sendVerificationEmail(user).catch((error) => {
      this.logger.warn(
        `Verify email after register failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email },
      select: {
        ...USER_SELECT,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    this.analytics.track({
      name: ANALYTICS_EVENTS.USER_SESSION_STARTED,
      userId: user.id,
      props: { method: 'password' },
    });

    return this.buildAuthResponse({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      isGuest: user.isGuest,
      emailVerifiedAt: user.emailVerifiedAt,
    });
  }

  async guestLogin(): Promise<AuthResponse> {
    const nickname = await this.nicknameService.generateUniqueNickname();
    const guestId = randomBytes(12).toString('hex');
    const email = `guest_${guestId}@guest.adventura`;
    const passwordHash = await bcrypt.hash(
      randomBytes(32).toString('base64url'),
      SALT_ROUNDS,
    );

    const user = await this.prisma.user.create({
      data: {
        email,
        nickname,
        passwordHash,
        isGuest: true,
      },
      select: USER_SELECT,
    });

    this.analytics.track({
      name: ANALYTICS_EVENTS.USER_REGISTERED,
      userId: user.id,
      props: { acquisition_source: 'guest', is_guest: true },
    });
    this.analytics.track({
      name: ANALYTICS_EVENTS.USER_SESSION_STARTED,
      userId: user.id,
      props: { method: 'guest' },
    });

    return this.buildAuthResponse(user);
  }

  generateNicknameSuggestion() {
    return {
      nickname: this.nicknameService.generateSuggestion(),
    };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: USER_SELECT,
        },
      },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }

      throw new UnauthorizedException('Сессия истекла, войдите снова');
    }

    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

    return this.buildAuthResponse(storedToken.user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  getProfile(user: AuthUser): AuthUser {
    return user;
  }

  async getProfileWithLinks(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_SELECT,
        oauthAccounts: { select: { provider: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toAuthUser(user, this.mapLinkedProviders(user.oauthAccounts));
  }

  async issueAuthResponse(userId: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_SELECT,
        oauthAccounts: { select: { provider: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.buildAuthResponse(
      user,
      this.mapLinkedProviders(user.oauthAccounts),
    );
  }

  mapLinkedProviders(
    accounts: Array<{ provider: 'VK' | 'YANDEX' }>,
  ): LinkedOAuthProvider[] {
    return accounts.map((row) =>
      row.provider === 'VK' ? 'vk' : 'yandex',
    );
  }

  async requestEmailVerification(user: AuthUser) {
    if (user.isGuest) {
      throw new BadRequestException('Гостевой аккаунт не требует подтверждения почты');
    }

    if (user.emailVerified) {
      return { ok: true, alreadyVerified: true };
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: USER_SELECT,
    });

    if (!dbUser) {
      throw new UnauthorizedException();
    }

    if (dbUser.emailVerifiedAt) {
      return { ok: true, alreadyVerified: true };
    }

    const sent = await this.sendVerificationEmail(dbUser);
    if (!sent) {
      throw new BadRequestException(
        'Не удалось отправить письмо. Попробуйте позже или проверьте настройки SMTP',
      );
    }

    return { ok: true, alreadyVerified: false };
  }

  async verifyEmail(token: string) {
    const record = await this.findValidEmailToken(token, EmailTokenType.VERIFY_EMAIL);

    await this.prisma.$transaction([
      this.prisma.emailToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailToken.updateMany({
        where: {
          userId: record.userId,
          type: EmailTokenType.VERIFY_EMAIL,
          usedAt: null,
          id: { not: record.id },
        },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  async forgotPassword(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: USER_SELECT,
    });

    // Не раскрываем, существует ли аккаунт.
    if (!user || user.isGuest) {
      return { ok: true };
    }

    const rawToken = await this.createEmailToken(
      user.id,
      EmailTokenType.RESET_PASSWORD,
    );
    const resetUrl = this.buildWebUrl(`/auth/reset-password?token=${rawToken}`);

    await this.mailService.sendMail({
      to: user.email,
      subject: 'Восстановление пароля — Adventura',
      text: [
        'Вы запросили сброс пароля в Adventura.',
        '',
        `Перейдите по ссылке (действует 1 час):`,
        resetUrl,
        '',
        'Если вы не запрашивали сброс — просто проигнорируйте это письмо.',
      ].join('\n'),
      html: this.renderEmailHtml({
        title: 'Восстановление пароля',
        body: 'Вы запросили сброс пароля в Adventura. Ссылка действует <b>1 час</b>.',
        ctaLabel: 'Задать новый пароль',
        ctaUrl: resetUrl,
        footnote: 'Если вы не запрашивали сброс — просто проигнорируйте это письмо.',
      }),
    });

    return { ok: true };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.findValidEmailToken(
      token,
      EmailTokenType.RESET_PASSWORD,
    );
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.emailToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: record.userId },
      }),
      this.prisma.emailToken.updateMany({
        where: {
          userId: record.userId,
          type: EmailTokenType.RESET_PASSWORD,
          usedAt: null,
          id: { not: record.id },
        },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  private async sendVerificationEmail(user: UserRow): Promise<boolean> {
    if (user.isGuest || user.emailVerifiedAt) {
      return true;
    }

    const rawToken = await this.createEmailToken(
      user.id,
      EmailTokenType.VERIFY_EMAIL,
    );
    const verifyUrl = this.buildWebUrl(`/auth/verify-email?token=${rawToken}`);

    return this.mailService.sendMail({
      to: user.email,
      subject: 'Подтвердите почту — Adventura',
      text: [
        `Привет, ${user.nickname}!`,
        '',
        'Подтвердите email в Adventura по ссылке (действует 1 час):',
        verifyUrl,
        '',
        'Пока почта не подтверждена, пользоваться приложением можно как обычно.',
      ].join('\n'),
      html: this.renderEmailHtml({
        title: 'Подтвердите почту',
        body: `Привет, <b>${this.escapeHtml(user.nickname)}</b>! Подтвердите email — ссылка действует <b>1 час</b>. Пока это не обязательно для использования приложения.`,
        ctaLabel: 'Подтвердить почту',
        ctaUrl: verifyUrl,
      }),
    });
  }

  private async createEmailToken(
    userId: string,
    type: EmailTokenType,
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          type,
          tokenHash: this.hashToken(rawToken),
          expiresAt,
        },
      }),
    ]);

    return rawToken;
  }

  private async findValidEmailToken(rawToken: string, type: EmailTokenType) {
    const token = rawToken.trim();
    if (!token) {
      throw new BadRequestException('Некорректная ссылка');
    }

    const record = await this.prisma.emailToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });

    if (!record || record.type !== type) {
      throw new BadRequestException('Ссылка недействительна или устарела');
    }

    if (record.usedAt) {
      throw new BadRequestException('Ссылка уже была использована');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Срок действия ссылки истёк');
    }

    return record;
  }

  private buildWebUrl(path: string): string {
    const base =
      this.configService.get<string>('WEB_PUBLIC_URL')?.trim() ||
      this.configService.get<string>('PUBLIC_URL')?.trim() ||
      'http://localhost:8081';
    return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private renderEmailHtml(input: {
    title: string;
    body: string;
    ctaLabel: string;
    ctaUrl: string;
    footnote?: string;
  }): string {
    const footnote = input.footnote
      ? `<p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5">${input.footnote}</p>`
      : '';

    return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#0f1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1115;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#181b22;border:1px solid #2a2f3a;border-radius:16px;padding:28px 24px;">
        <tr><td>
          <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Adventura</p>
          <h1 style="margin:0 0 12px;color:#f3f4f6;font-size:22px;line-height:1.3;">${input.title}</h1>
          <p style="margin:0 0 24px;color:#d1d5db;font-size:15px;line-height:1.55;">${input.body}</p>
          <a href="${input.ctaUrl}" style="display:inline-block;background:#c45c26;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px;">${input.ctaLabel}</a>
          <p style="margin:20px 0 0;color:#6b7280;font-size:12px;line-height:1.5;word-break:break-all;">Если кнопка не работает, скопируйте ссылку:<br/>${input.ctaUrl}</p>
          ${footnote}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private toAuthUser(
    user: UserRow,
    linkedProviders: LinkedOAuthProvider[] = [],
  ): AuthUser {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      isGuest: user.isGuest,
      emailVerified: Boolean(user.emailVerifiedAt),
      linkedProviders,
    };
  }

  private async buildAuthResponse(
    user: UserRow,
    linkedProviders?: LinkedOAuthProvider[],
  ): Promise<AuthResponse> {
    const providers =
      linkedProviders ??
      this.mapLinkedProviders(
        await this.prisma.oAuthAccount.findMany({
          where: { userId: user.id },
          select: { provider: true },
        }),
      );
    const authUser = this.toAuthUser(user, providers);
    const accessToken = this.jwtService.sign({
      sub: authUser.id,
      email: authUser.email,
      nickname: authUser.nickname,
      isGuest: authUser.isGuest,
    });

    const refreshToken = await this.createRefreshToken(authUser.id);

    return {
      accessToken,
      refreshToken,
      user: authUser,
    };
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = this.getRefreshTokenExpiry();

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId,
        expiresAt,
      },
    });

    return refreshToken;
  }

  private getRefreshTokenExpiry(): Date {
    const expiresInDays = Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_DAYS', '30'),
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    return expiresAt;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

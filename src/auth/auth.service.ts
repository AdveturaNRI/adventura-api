import { createHash, randomBytes } from 'crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { ANALYTICS_EVENTS } from '../analytics/analytics.constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { NicknameService } from '../nickname/nickname.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponse, AuthUser } from './types/auth-response.type';

const SALT_ROUNDS = 10;
const USER_SELECT = {
  id: true,
  email: true,
  nickname: true,
  isGuest: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly nicknameService: NicknameService,
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analytics: AnalyticsService,
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

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email },
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

  private async buildAuthResponse(user: AuthUser): Promise<AuthResponse> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      nickname: user.nickname,
      isGuest: user.isGuest,
    });

    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user,
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

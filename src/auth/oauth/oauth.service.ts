import { randomBytes } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { OAuthProvider } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { ANALYTICS_EVENTS } from '../../analytics/analytics.constants';
import { AnalyticsService } from '../../analytics/analytics.service';
import { MarketingAttributionService } from '../../marketing/attribution/marketing-attribution.service';
import { MarketingConversionsService } from '../../marketing/conversions/marketing-conversions.service';
import { NicknameService } from '../../nickname/nickname.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';
import type { AuthResponse, AuthUser } from '../types/auth-response.type';
import type {
  LinkedOAuthProvider,
  OAuthIdentity,
  OAuthLoginMeta,
} from './oauth.types';
import { VkOAuthProvider } from './vk.provider';
import { YandexOAuthProvider } from './yandex.provider';

const SALT_ROUNDS = 10;
const GUEST_EMAIL_RE = /^guest_[a-f0-9]+@guest\.adventura$/i;

const USER_SELECT = {
  id: true,
  email: true,
  nickname: true,
  isGuest: true,
  emailVerifiedAt: true,
} as const;

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nicknameService: NicknameService,
    private readonly vk: VkOAuthProvider,
    private readonly yandex: YandexOAuthProvider,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analytics: AnalyticsService,
    private readonly attribution: MarketingAttributionService,
    private readonly conversions: MarketingConversionsService,
  ) {}

  async loginWithVk(
    dto: {
      accessToken?: string;
      silentToken?: string;
      uuid?: string;
    },
    meta: OAuthLoginMeta = {},
  ): Promise<AuthResponse> {
    const identity = await this.resolveVkIdentity(dto);
    return this.loginOrRegister(identity, meta);
  }

  async loginWithYandex(
    accessToken: string,
    meta: OAuthLoginMeta = {},
  ): Promise<AuthResponse> {
    const identity = await this.yandex.resolveIdentity(accessToken);
    return this.loginOrRegister(identity, meta);
  }

  async linkVk(
    user: AuthUser,
    dto: {
      accessToken?: string;
      silentToken?: string;
      uuid?: string;
    },
  ): Promise<AuthUser> {
    const identity = await this.resolveVkIdentity(dto);
    return this.linkIdentity(user.id, identity);
  }

  async linkYandex(user: AuthUser, accessToken: string): Promise<AuthUser> {
    const identity = await this.yandex.resolveIdentity(accessToken);
    return this.linkIdentity(user.id, identity);
  }

  private async resolveVkIdentity(dto: {
    accessToken?: string;
    silentToken?: string;
    uuid?: string;
  }) {
    if (dto.accessToken?.trim()) {
      return this.vk.resolveFromAccessToken(dto.accessToken);
    }
    if (dto.silentToken?.trim() && dto.uuid?.trim()) {
      return this.vk.resolveFromSilentToken(dto.silentToken, dto.uuid);
    }
    throw new BadRequestException('Нужен accessToken или silentToken+uuid');
  }

  async unlink(user: AuthUser, provider: OAuthProvider): Promise<AuthUser> {
    const accounts = await this.prisma.oAuthAccount.findMany({
      where: { userId: user.id },
    });
    const target = accounts.find((row) => row.provider === provider);
    if (!target) {
      throw new BadRequestException('Этот провайдер не привязан');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isGuest: true, email: true, passwordHash: true },
    });
    if (!dbUser) {
      throw new UnauthorizedException();
    }

    const remainingProviders = accounts.length - 1;
    const hasRealEmail = !GUEST_EMAIL_RE.test(dbUser.email);
    const hasPasswordLogin = !dbUser.isGuest && hasRealEmail;

    if (remainingProviders === 0 && !hasPasswordLogin) {
      throw new BadRequestException(
        'Нельзя отвязать единственный способ входа. Сначала задайте пароль или привяжите другой аккаунт',
      );
    }

    await this.prisma.oAuthAccount.delete({ where: { id: target.id } });
    return this.authService.getProfileWithLinks(user.id);
  }

  toLinkedProvider(provider: OAuthProvider): LinkedOAuthProvider {
    return provider === OAuthProvider.VK ? 'vk' : 'yandex';
  }

  private async loginOrRegister(
    identity: OAuthIdentity,
    meta: OAuthLoginMeta,
  ): Promise<AuthResponse> {
    const existingLink = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: identity.provider,
          providerUserId: identity.providerUserId,
        },
      },
      include: { user: { select: USER_SELECT } },
    });

    if (existingLink) {
      this.analytics.track({
        name: ANALYTICS_EVENTS.USER_SESSION_STARTED,
        userId: existingLink.userId,
        props: {
          method: this.toLinkedProvider(identity.provider),
        },
      });
      return this.authService.issueAuthResponse(existingLink.user.id);
    }

    if (identity.email) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: identity.email },
        select: { ...USER_SELECT, oauthAccounts: { select: { provider: true } } },
      });

      if (byEmail) {
        const alreadyHasProvider = byEmail.oauthAccounts.some(
          (row) => row.provider === identity.provider,
        );
        if (alreadyHasProvider) {
          throw new ConflictException(
            'Этот email уже привязан к другому аккаунту провайдера',
          );
        }

        await this.prisma.oAuthAccount.create({
          data: {
            provider: identity.provider,
            providerUserId: identity.providerUserId,
            email: identity.email,
            userId: byEmail.id,
          },
        });

        if (!byEmail.emailVerifiedAt && identity.email) {
          await this.prisma.user.update({
            where: { id: byEmail.id },
            data: { emailVerifiedAt: new Date(), isGuest: false },
          });
        } else if (byEmail.isGuest) {
          await this.prisma.user.update({
            where: { id: byEmail.id },
            data: { isGuest: false },
          });
        }

        this.analytics.track({
          name: ANALYTICS_EVENTS.USER_SESSION_STARTED,
          userId: byEmail.id,
          props: {
            method: this.toLinkedProvider(identity.provider),
            linked_existing: true,
          },
        });

        return this.authService.issueAuthResponse(byEmail.id);
      }
    }

    const user = await this.createOAuthUser(identity);
    await this.recordRegistration(user.id, identity.provider, meta);

    this.analytics.track({
      name: ANALYTICS_EVENTS.USER_SESSION_STARTED,
      userId: user.id,
      props: { method: this.toLinkedProvider(identity.provider) },
    });

    return this.authService.issueAuthResponse(user.id);
  }

  private async linkIdentity(
    userId: string,
    identity: OAuthIdentity,
  ): Promise<AuthUser> {
    const taken = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: identity.provider,
          providerUserId: identity.providerUserId,
        },
      },
    });

    if (taken && taken.userId !== userId) {
      throw new ConflictException(
        'Этот аккаунт уже привязан к другому пользователю',
      );
    }

    if (taken && taken.userId === userId) {
      return this.authService.getProfileWithLinks(userId);
    }

    const existingSameProvider = await this.prisma.oAuthAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: identity.provider,
        },
      },
    });
    if (existingSameProvider) {
      throw new ConflictException('Провайдер уже привязан к этому аккаунту');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.oAuthAccount.create({
        data: {
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          email: identity.email,
          userId,
        },
      });

      const patch: {
        isGuest?: boolean;
        email?: string;
        emailVerifiedAt?: Date;
      } = {};

      if (user.isGuest) {
        patch.isGuest = false;
      }

      if (identity.email) {
        const emailOwner = await tx.user.findUnique({
          where: { email: identity.email },
          select: { id: true },
        });
        if (!emailOwner) {
          if (GUEST_EMAIL_RE.test(user.email) || user.isGuest) {
            patch.email = identity.email;
            patch.emailVerifiedAt = new Date();
          }
        } else if (emailOwner.id === userId && !user.emailVerifiedAt) {
          patch.emailVerifiedAt = new Date();
        }
      }

      if (Object.keys(patch).length > 0) {
        await tx.user.update({ where: { id: userId }, data: patch });
      }
    });

    return this.authService.getProfileWithLinks(userId);
  }

  private async createOAuthUser(identity: OAuthIdentity) {
    const nickname = await this.nicknameService.generateUniqueNickname();
    const passwordHash = await bcrypt.hash(
      randomBytes(32).toString('base64url'),
      SALT_ROUNDS,
    );

    let email =
      identity.email ||
      `${identity.provider.toLowerCase()}_${identity.providerUserId}@oauth.adventura.local`;

    const emailTaken = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailTaken) {
      email = `${identity.provider.toLowerCase()}_${identity.providerUserId}_${randomBytes(4).toString('hex')}@oauth.adventura.local`;
    }

    return this.prisma.user.create({
      data: {
        email,
        nickname,
        passwordHash,
        isGuest: false,
        emailVerifiedAt: identity.email ? new Date() : null,
        oauthAccounts: {
          create: {
            provider: identity.provider,
            providerUserId: identity.providerUserId,
            email: identity.email,
          },
        },
      },
      select: USER_SELECT,
    });
  }

  private async recordRegistration(
    userId: string,
    provider: OAuthProvider,
    meta: OAuthLoginMeta,
  ) {
    const source =
      meta.acquisitionSource?.trim().slice(0, 64) ||
      this.toLinkedProvider(provider);

    this.analytics.track({
      name: ANALYTICS_EVENTS.USER_REGISTERED,
      userId,
      props: {
        acquisition_source: source,
        is_guest: false,
        oauth_provider: this.toLinkedProvider(provider),
      },
    });

    if (meta.anonymousId) {
      await this.attribution
        .bindAnonymousTouches(userId, meta.anonymousId)
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to bind marketing touches after oauth register: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    void this.conversions
      .recordConversion({
        type: 'REGISTRATION_COMPLETED',
        userId,
        anonymousId: meta.anonymousId,
        idempotencyKey: `register:${userId}`,
        props: { acquisition_source: source },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to record marketing conversion after oauth register: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }
}

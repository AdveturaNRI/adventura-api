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
import { ImageProcessorService } from '../../image/image-processor.service';
import { MarketingAttributionService } from '../../marketing/attribution/marketing-attribution.service';
import { MarketingConversionsService } from '../../marketing/conversions/marketing-conversions.service';
import { MediaService } from '../../media/media.service';
import { NicknameService } from '../../nickname/nickname.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';
import type { AuthResponse, AuthUser } from '../types/auth-response.type';
import type {
  LinkedOAuthProvider,
  OAuthIdentity,
  OAuthLoginMeta,
} from './oauth.types';
import { SYNTHETIC_OAUTH_EMAIL_RE } from './oauth.types';
import { VkOAuthProvider } from './vk.provider';
import { YandexOAuthProvider } from './yandex.provider';

const SALT_ROUNDS = 10;
const GUEST_EMAIL_RE = /^guest_[a-f0-9]+@guest\.adventura$/i;
const USER_ENTITY_TYPE = 'User';
const AVATAR_COLLECTION = 'avatar';
const PROFILE_CARD_COLLECTION = 'profileCard';
const MAX_OAUTH_AVATAR_BYTES = 8 * 1024 * 1024;

const USER_SELECT = {
  id: true,
  email: true,
  nickname: true,
  isGuest: true,
  emailVerifiedAt: true,
} as const;

function isPlaceholderEmail(email: string) {
  return GUEST_EMAIL_RE.test(email) || SYNTHETIC_OAUTH_EMAIL_RE.test(email);
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nicknameService: NicknameService,
    private readonly vk: VkOAuthProvider,
    private readonly yandex: YandexOAuthProvider,
    private readonly mediaService: MediaService,
    private readonly imageProcessor: ImageProcessorService,
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
    const hasRealEmail = !isPlaceholderEmail(dbUser.email);
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
      void this.enrichExistingUser(existingLink.userId, existingLink.user.email, identity);
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
        select: {
          ...USER_SELECT,
          oauthAccounts: { select: { provider: true } },
        },
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

        void this.importAvatarIfMissing(byEmail.id, identity.avatarUrl);

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
    void this.importAvatarIfMissing(user.id, identity.avatarUrl);

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
      void this.enrichExistingUser(userId, null, identity);
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
          if (isPlaceholderEmail(user.email) || user.isGuest) {
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

    void this.importAvatarIfMissing(userId, identity.avatarUrl);

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

    if (!identity.email) {
      this.logger.warn(
        `Creating oauth user without provider email (${identity.provider}:${identity.providerUserId}) → ${email}`,
      );
    }

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

  /** On repeat login: fill real email / avatar if we previously stored placeholders. */
  private async enrichExistingUser(
    userId: string,
    currentEmail: string | null,
    identity: OAuthIdentity,
  ) {
    try {
      const email =
        currentEmail ??
        (
          await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          })
        )?.email;

      if (identity.email && email && isPlaceholderEmail(email)) {
        const owner = await this.prisma.user.findUnique({
          where: { email: identity.email },
          select: { id: true },
        });
        if (!owner) {
          await this.prisma.user.update({
            where: { id: userId },
            data: {
              email: identity.email,
              emailVerifiedAt: new Date(),
              isGuest: false,
            },
          });
          await this.prisma.oAuthAccount.updateMany({
            where: {
              userId,
              provider: identity.provider,
              providerUserId: identity.providerUserId,
            },
            data: { email: identity.email },
          });
        }
      }

      await this.importAvatarIfMissing(userId, identity.avatarUrl);
    } catch (error) {
      this.logger.warn(
        `OAuth enrich failed for ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async importAvatarIfMissing(
    userId: string,
    avatarUrl: string | null,
  ) {
    if (!avatarUrl?.trim()) {
      return;
    }

    try {
      const existing = await this.mediaService.getCollection({
        entityType: USER_ENTITY_TYPE,
        entityId: userId,
        collection: AVATAR_COLLECTION,
      });
      if (existing.length > 0) {
        return;
      }

      const res = await fetch(avatarUrl.trim(), {
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        this.logger.warn(
          `OAuth avatar fetch HTTP ${res.status} for user ${userId}`,
        );
        return;
      }

      const headerType = (res.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength < 64 || buffer.byteLength > MAX_OAUTH_AVATAR_BYTES) {
        return;
      }

      const mimeType = this.sniffImageMime(buffer, headerType);
      if (!mimeType) {
        this.logger.warn(`OAuth avatar unsupported type for user ${userId}`);
        return;
      }

      const avatarVariants = await this.imageProcessor.processImage(
        buffer,
        mimeType,
        ['thumb', 'small', 'medium', 'large'],
      );
      const cardVariants = await this.imageProcessor.processImage(
        buffer,
        mimeType,
        ['cardThumb', 'card', 'original'],
      );

      await this.mediaService.replaceCollection(
        {
          entityType: USER_ENTITY_TYPE,
          entityId: userId,
          collection: AVATAR_COLLECTION,
        },
        avatarVariants,
      );
      await this.mediaService.replaceCollection(
        {
          entityType: USER_ENTITY_TYPE,
          entityId: userId,
          collection: PROFILE_CARD_COLLECTION,
        },
        cardVariants,
      );

      await this.prisma.user.update({
        where: { id: userId },
        data: { updatedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `OAuth avatar import failed for ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private sniffImageMime(
    buffer: Buffer,
    headerType: string,
  ): string | null {
    if (
      headerType === 'image/jpeg' ||
      headerType === 'image/png' ||
      headerType === 'image/webp'
    ) {
      return headerType;
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      return 'image/jpeg';
    }
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    }
    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }
    return null;
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

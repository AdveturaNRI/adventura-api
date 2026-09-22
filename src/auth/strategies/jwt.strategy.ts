import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../types/auth-response.type';

type JwtPayload = {
  sub: string;
  email: string;
  nickname: string;
};

/** Touch lastSeen at most once per this window per user (any authenticated HTTP call). */
const LAST_SEEN_TOUCH_MS = 30_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly lastSeenTouchAt = new Map<string, number>();

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        nickname: true,
        isGuest: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    // Any section of the app that hits the API keeps presence warm — not only chats.
    const now = Date.now();
    const prev = this.lastSeenTouchAt.get(user.id) ?? 0;
    if (now - prev >= LAST_SEEN_TOUCH_MS) {
      this.lastSeenTouchAt.set(user.id, now);
      void this.prisma.user
        .update({
          where: { id: user.id },
          data: { lastSeenAt: new Date(now) },
        })
        .catch(() => undefined);
    }

    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      isGuest: user.isGuest,
      emailVerified: Boolean(user.emailVerifiedAt),
    };
  }
}

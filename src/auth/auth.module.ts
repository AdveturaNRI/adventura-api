import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AnalyticsModule } from '../analytics/analytics.module';
import { MarketingAttributionModule } from '../marketing/attribution/marketing-attribution.module';
import { MarketingConversionsModule } from '../marketing/conversions/marketing-conversions.module';
import { NicknameModule } from '../nickname/nickname.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OAuthService } from './oauth/oauth.service';
import { VkOAuthProvider } from './oauth/vk.provider';
import { YandexOAuthProvider } from './oauth/yandex.provider';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    NicknameModule,
    forwardRef(() => AnalyticsModule),
    forwardRef(() => MarketingAttributionModule),
    MarketingConversionsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '15m',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OAuthService,
    VkOAuthProvider,
    YandexOAuthProvider,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppSettingsModule } from './app-settings/app-settings.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { ArtStudioModule } from './art-studio/art-studio.module';
import { ChatsModule } from './chats/chats.module';
import { ClubsModule } from './clubs/clubs.module';
import { GamesModule } from './games/games.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { MarketingModule } from './marketing/marketing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationSoundsModule } from './notification-sounds/notification-sounds.module';
import { PrismaModule } from './prisma/prisma.module';
import { PushSubscriptionsModule } from './push-subscriptions/push-subscriptions.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReferenceModule } from './reference/reference.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    StorageModule,
    PrismaModule,
    MailModule,
    MarketingModule,
    AppSettingsModule,
    AnalyticsModule,
    AuthModule,
    ReferenceModule,
    UsersModule,
    HealthModule,
    RealtimeModule,
    ChatsModule,
    NotificationsModule,
    NotificationSoundsModule,
    PushSubscriptionsModule,
    GamesModule,
    ClubsModule,
    ArtStudioModule,
  ],
})
export class AppModule {}

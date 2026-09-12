import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { ChatsModule } from './chats/chats.module';
import { ClubsModule } from './clubs/clubs.module';
import { GamesModule } from './games/games.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReferenceModule } from './reference/reference.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    ReferenceModule,
    UsersModule,
    HealthModule,
    RealtimeModule,
    ChatsModule,
    NotificationsModule,
    GamesModule,
    ClubsModule,
  ],
})
export class AppModule {}

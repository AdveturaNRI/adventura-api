import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChatsModule } from '../chats/chats.module';
import { ImageModule } from '../image/image.module';
import { MediaModule } from '../media/media.module';
import { MarketingConversionsModule } from '../marketing/conversions/marketing-conversions.module';
import { NotificationSoundsModule } from '../notification-sounds/notification-sounds.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersController } from './users.controller';
import { UserGameSystemsService } from './user-game-systems.service';
import { UsersService } from './users.service';

@Module({
  imports: [
    AuthModule,
    MediaModule,
    ImageModule,
    NotificationsModule,
    NotificationSoundsModule,
    MarketingConversionsModule,
    forwardRef(() => ChatsModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, UserGameSystemsService],
  exports: [UsersService, UserGameSystemsService],
})
export class UsersModule {}

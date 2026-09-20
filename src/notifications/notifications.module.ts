import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChatsModule } from '../chats/chats.module';
import { MediaModule } from '../media/media.module';
import { PushSubscriptionsModule } from '../push-subscriptions/push-subscriptions.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BroadcastService } from './broadcast.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    AuthModule,
    MediaModule,
    RealtimeModule,
    PushSubscriptionsModule,
    forwardRef(() => ChatsModule),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, BroadcastService],
  exports: [NotificationsService, BroadcastService],
})
export class NotificationsModule {}

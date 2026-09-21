import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ImageModule } from '../image/image.module';
import { MediaModule } from '../media/media.module';
import { PushSubscriptionsModule } from '../push-subscriptions/push-subscriptions.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RewardsModule } from '../rewards/rewards.module';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  imports: [
    AuthModule,
    MediaModule,
    ImageModule,
    RealtimeModule,
    PushSubscriptionsModule,
    RewardsModule,
  ],
  controllers: [ChatsController],
  providers: [ChatsService],
  exports: [ChatsService],
})
export class ChatsModule {}

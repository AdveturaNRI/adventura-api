import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushSubscriptionsService } from './push-subscriptions.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [PushSubscriptionsController],
  providers: [PushSubscriptionsService],
  exports: [PushSubscriptionsService],
})
export class PushSubscriptionsModule {}

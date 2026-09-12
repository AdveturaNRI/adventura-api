import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChatsModule } from '../chats/chats.module';
import { MediaModule } from '../media/media.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule, MediaModule, RealtimeModule, forwardRef(() => ChatsModule)],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module';
import { NotificationSoundsController } from './notification-sounds.controller';
import { NotificationSoundsService } from './notification-sounds.service';

@Module({
  imports: [MediaModule],
  controllers: [NotificationSoundsController],
  providers: [NotificationSoundsService],
  exports: [NotificationSoundsService],
})
export class NotificationSoundsModule {}

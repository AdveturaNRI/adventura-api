import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ImageModule } from '../image/image.module';
import { MediaModule } from '../media/media.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminKeyGuard } from '../rewards/admin-key.guard';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [AuthModule, MediaModule, ImageModule, RealtimeModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AdminKeyGuard],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}

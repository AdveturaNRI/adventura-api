import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ImageModule } from '../image/image.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RewardsModule } from '../rewards/rewards.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [AuthModule, MediaModule, ImageModule, NotificationsModule, RewardsModule],
  controllers: [ClubsController],
  providers: [ClubsService],
  exports: [ClubsService],
})
export class ClubsModule {}

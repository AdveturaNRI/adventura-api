import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ImageModule } from '../image/image.module';
import { MediaModule } from '../media/media.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [AuthModule, MediaModule, ImageModule],
  controllers: [ClubsController],
  providers: [ClubsService],
  exports: [ClubsService],
})
export class ClubsModule {}

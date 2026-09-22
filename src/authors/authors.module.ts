import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ImageModule } from '../image/image.module';
import { MediaModule } from '../media/media.module';
import { RewardsModule } from '../rewards/rewards.module';
import { AuthorsController } from './authors.controller';
import { AuthorsService } from './authors.service';

@Module({
  imports: [AuthModule, MediaModule, ImageModule, RewardsModule],
  controllers: [AuthorsController],
  providers: [AuthorsService],
  exports: [AuthorsService],
})
export class AuthorsModule {}

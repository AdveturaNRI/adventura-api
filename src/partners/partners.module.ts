import { Module } from '@nestjs/common';

import { ImageModule } from '../image/image.module';
import { MediaModule } from '../media/media.module';
import { PartnerPostsService } from './partner-posts.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [MediaModule, ImageModule],
  controllers: [PartnersController],
  providers: [PartnersService, PartnerPostsService],
  exports: [PartnersService, PartnerPostsService],
})
export class PartnersModule {}

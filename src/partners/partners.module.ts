import { Module } from '@nestjs/common';

import { ImageModule } from '../image/image.module';
import { MediaModule } from '../media/media.module';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [MediaModule, ImageModule],
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}

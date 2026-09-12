import { Module } from '@nestjs/common';

import { ImageModule } from '../image/image.module';
import { MediaService } from './media.service';

@Module({
  imports: [ImageModule],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}

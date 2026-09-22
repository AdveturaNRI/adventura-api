import { Module } from '@nestjs/common';

import { ImageModule } from '../../image/image.module';
import { MediaModule } from '../../media/media.module';
import { MarketingLandingsController } from './marketing-landings.controller';
import { MarketingLandingsService } from './marketing-landings.service';

@Module({
  imports: [MediaModule, ImageModule],
  controllers: [MarketingLandingsController],
  providers: [MarketingLandingsService],
  exports: [MarketingLandingsService],
})
export class MarketingLandingsModule {}

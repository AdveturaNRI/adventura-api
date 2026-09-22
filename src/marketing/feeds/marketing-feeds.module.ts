import { Module } from '@nestjs/common';

import { MediaModule } from '../../media/media.module';
import { MarketingFeedsController } from './marketing-feeds.controller';
import { MarketingFeedsService } from './marketing-feeds.service';

@Module({
  imports: [MediaModule],
  controllers: [MarketingFeedsController],
  providers: [MarketingFeedsService],
})
export class MarketingFeedsModule {}


import { Module } from '@nestjs/common';

import { MarketingConversionsController } from './marketing-conversions.controller';
import { MarketingConversionsService } from './marketing-conversions.service';

@Module({
  controllers: [MarketingConversionsController],
  providers: [MarketingConversionsService],
  exports: [MarketingConversionsService],
})
export class MarketingConversionsModule {}


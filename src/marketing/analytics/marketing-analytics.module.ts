import { Module } from '@nestjs/common';

import { MarketingAnalyticsService } from './marketing-analytics.service';

@Module({
  providers: [MarketingAnalyticsService],
  exports: [MarketingAnalyticsService],
})
export class MarketingAnalyticsModule {}


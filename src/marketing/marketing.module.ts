import { Module } from '@nestjs/common';

import { MarketingLandingsModule } from './landings/marketing-landings.module';
import { MarketingCampaignsModule } from './campaigns/marketing-campaigns.module';
import { MarketingAttributionModule } from './attribution/marketing-attribution.module';
import { MarketingConversionsModule } from './conversions/marketing-conversions.module';
import { MarketingAnalyticsModule } from './analytics/marketing-analytics.module';
import { MarketingFeedsModule } from './feeds/marketing-feeds.module';

@Module({
  imports: [
    MarketingLandingsModule,
    MarketingCampaignsModule,
    MarketingAttributionModule,
    MarketingConversionsModule,
    MarketingAnalyticsModule,
    MarketingFeedsModule,
  ],
})
export class MarketingModule {}

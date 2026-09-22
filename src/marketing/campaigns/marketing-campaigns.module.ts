import { Module } from '@nestjs/common';
import { MarketingCampaignsService } from './marketing-campaigns.service';
@Module({ providers: [MarketingCampaignsService], exports: [MarketingCampaignsService] })
export class MarketingCampaignsModule {}

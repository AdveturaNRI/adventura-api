import { Controller, Get, Query } from '@nestjs/common';

import { ListMarketingFeedQueryDto } from './dto/list-marketing-feed.dto';
import { MarketingFeedsService } from './marketing-feeds.service';

@Controller('marketing/feeds')
export class MarketingFeedsController {
  constructor(private readonly feeds: MarketingFeedsService) {}

  @Get('games')
  games(@Query() query: ListMarketingFeedQueryDto) {
    return this.feeds.listGames(query.limit ?? 12);
  }

  @Get('clubs')
  clubs(@Query() query: ListMarketingFeedQueryDto) {
    return this.feeds.listClubs(query.limit ?? 12);
  }
}


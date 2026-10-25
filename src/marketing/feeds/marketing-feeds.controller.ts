import { Controller, Get, Param, Query } from '@nestjs/common';

import { ListMarketingFeedQueryDto } from './dto/list-marketing-feed.dto';
import { MarketingFeedsService } from './marketing-feeds.service';

@Controller('marketing/feeds')
export class MarketingFeedsController {
  constructor(private readonly feeds: MarketingFeedsService) {}

  @Get('wanderers')
  wanderers(@Query() query: ListMarketingFeedQueryDto) {
    return this.feeds.listWanderers(query.limit ?? 12);
  }

  @Get('wanderers/:nickname')
  wanderer(@Param('nickname') nickname: string) {
    return this.feeds.getWanderer(nickname);
  }

  @Get('publications')
  publications(@Query() query: ListMarketingFeedQueryDto) {
    return this.feeds.listPublications(query.limit ?? 12);
  }

  @Get('games')
  games(@Query() query: ListMarketingFeedQueryDto) {
    return this.feeds.listGames(query.limit ?? 12);
  }

  @Get('clubs')
  clubs(@Query() query: ListMarketingFeedQueryDto) {
    return this.feeds.listClubs(query.limit ?? 12);
  }
}


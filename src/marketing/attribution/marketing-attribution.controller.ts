import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { RecordMarketingTouchDto } from './dto/record-marketing-touch.dto';
import { MarketingAttributionService } from './marketing-attribution.service';

@Controller('marketing/attribution')
export class MarketingAttributionController {
  constructor(private readonly attribution: MarketingAttributionService) {}

  @Post('touches')
  @HttpCode(202)
  record(@Body() dto: RecordMarketingTouchDto) {
    return this.attribution.recordTouch(dto);
  }

}

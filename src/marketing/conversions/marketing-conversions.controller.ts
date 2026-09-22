import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { MarketingConversionsService } from './marketing-conversions.service';
import { RecordMarketingConversionDto } from './dto/record-marketing-conversion.dto';

@Controller('marketing/conversions')
export class MarketingConversionsController {
  constructor(private readonly conversions: MarketingConversionsService) {}

  @Post()
  @HttpCode(202)
  record(@Body() dto: RecordMarketingConversionDto) {
    return this.conversions.recordConversion({
      type: dto.type as never,
      anonymousId: dto.anonymousId,
      variantId: dto.variantId,
      landingSlug: dto.landingSlug,
      idempotencyKey: dto.idempotencyKey,
      props: dto.props,
    });
  }
}


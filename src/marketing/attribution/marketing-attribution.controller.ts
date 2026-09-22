import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../../auth/types/auth-response.type';
import { BindMarketingTouchesDto } from './dto/bind-marketing-touches.dto';
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

  @Post('bind')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  bind(@CurrentUser() user: AuthUser, @Body() dto: BindMarketingTouchesDto) {
    return this.attribution.bindAnonymousTouches(user.id, dto.anonymousId);
  }
}

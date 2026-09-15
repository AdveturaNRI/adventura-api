import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { RemovePushSubscriptionDto } from './dto/remove-push-subscription.dto';
import { UpsertPushSubscriptionDto } from './dto/upsert-push-subscription.dto';
import { PushSubscriptionsService } from './push-subscriptions.service';

@Controller('push')
export class PushSubscriptionsController {
  constructor(private readonly pushSubscriptions: PushSubscriptionsService) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return this.pushSubscriptions.getPublicKey();
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertPushSubscriptionDto) {
    return this.pushSubscriptions.upsertSubscription(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('subscriptions')
  remove(@CurrentUser() user: AuthUser, @Body() dto: RemovePushSubscriptionDto) {
    return this.pushSubscriptions.removeByEndpoint(user.id, dto.endpoint);
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscriptions/status')
  status(@CurrentUser() user: AuthUser, @Query('endpoint') endpoint?: string) {
    return this.pushSubscriptions.statusForEndpoint(user.id, endpoint ?? '');
  }
}

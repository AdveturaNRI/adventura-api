import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { AdminKeyGuard } from './admin-key.guard';
import { GrantAlphaTestersDto, GrantRewardDto, UnlockCosmeticDto, UnlockFrameDto } from './dto/grant-reward.dto';
import { UpdateCosmeticsDto } from './dto/update-cosmetics.dto';
import { RewardsService } from './rewards.service';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.rewardsService.getMyRewards(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/cosmetics')
  updateCosmetics(@CurrentUser() user: AuthUser, @Body() dto: UpdateCosmeticsDto) {
    return this.rewardsService.updateCosmetics(user.id, dto);
  }

  @UseGuards(AdminKeyGuard)
  @Post('grant')
  grant(@Body() dto: GrantRewardDto) {
    return this.rewardsService.grantReward(dto.userId, dto.badgeType);
  }

  @UseGuards(AdminKeyGuard)
  @Post('unlock-frame')
  unlockFrame(@Body() dto: UnlockFrameDto) {
    return this.rewardsService.unlockFrame(dto.userId, { frameId: dto.frameId, all: dto.all });
  }

  @UseGuards(AdminKeyGuard)
  @Post('unlock-cosmetic')
  unlockCosmetic(@Body() dto: UnlockCosmeticDto) {
    return this.rewardsService.unlockCosmetic(dto.userId, {
      kind: dto.kind,
      itemId: dto.itemId,
      all: dto.all,
    });
  }

  @UseGuards(AdminKeyGuard)
  @Post('grant-alpha')
  grantAlpha(@Body() dto: GrantAlphaTestersDto) {
    return this.rewardsService.grantAlphaTesters(dto.cutoff);
  }
}

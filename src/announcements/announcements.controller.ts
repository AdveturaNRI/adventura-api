import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { AdminKeyGuard } from '../rewards/admin-key.guard';
import { AnnouncementsService } from './announcements.service';

class DismissAnnouncementDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  publicationVersion!: number;
}

class NotifyPublishedDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  publicationVersion!: number;
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('pending')
  @UseGuards(JwtAuthGuard)
  listPending(@CurrentUser() user: AuthUser) {
    return this.announcements.listPendingForUser(user.id);
  }

  /** Published news feed for the in-app news section. */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  listNews(@CurrentUser() user: AuthUser | undefined) {
    return this.announcements.listNews(user?.id ?? null);
  }

  /** Used by seed script against the already running API process. */
  @Post('dev/notify-published')
  @UseGuards(AdminKeyGuard)
  notifyPublished(@Body() body: NotifyPublishedDto) {
    return this.announcements.notifyPublished(
      body.id,
      body.publicationVersion,
    );
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  getNews(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id') id: string,
  ) {
    return this.announcements.getNews(user?.id ?? null, id);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  toggleLike(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcements.toggleLike(user!.id, id);
  }

  @Post(':id/view')
  @UseGuards(OptionalJwtAuthGuard)
  incrementViews(@Param('id') id: string) {
    return this.announcements.incrementViews(id);
  }

  @Post(':id/dismiss')
  @UseGuards(JwtAuthGuard)
  dismiss(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: DismissAnnouncementDto,
  ) {
    return this.announcements.dismissForUser(
      user.id,
      id,
      body.publicationVersion,
    );
  }
}

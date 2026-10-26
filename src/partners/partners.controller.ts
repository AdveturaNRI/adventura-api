import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { PartnerPostsService } from './partner-posts.service';
import { PartnersService } from './partners.service';

const IMAGE_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

@Controller('partners')
export class PartnersController {
  constructor(
    private readonly partners: PartnersService,
    private readonly posts: PartnerPostsService,
  ) {}

  /**
   * Публичный список партнёров.
   * `?sidebar=1` — только с галкой «В боковом меню» (и активные).
   */
  @Get()
  list(@Query('sidebar') sidebar?: string) {
    const sidebarOnly =
      sidebar === '1' || sidebar === 'true' || sidebar === 'yes';
    return this.partners.listPublic({ sidebarOnly });
  }

  /** Свежие новости партнёров для карточки в сайдбаре: по одной на партнёра. */
  @Get('news')
  listNews() {
    return this.posts.listLive();
  }

  @Get('news/:id')
  getNews(@Param('id') id: string) {
    return this.posts.getPublished(id);
  }

  @Post('news/:id/view')
  @HttpCode(200)
  viewNews(@Param('id') id: string) {
    return this.posts.track(id, 'view');
  }

  @Post('news/:id/click')
  @HttpCode(200)
  clickNews(@Param('id') id: string) {
    return this.posts.track(id, 'click');
  }

  @Get('news/:id/cover')
  async newsCover(@Param('id') id: string, @Res() res: Response) {
    const asset = await this.posts.getCoverAsset(id);
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', IMAGE_CACHE);
    res.send(asset.body);
  }

  /** Стабильный URL логотипа (без протухающих signed S3 links). */
  @Get(':id/logo')
  async logo(@Param('id') id: string, @Res() res: Response) {
    const asset = await this.partners.getLogoAsset(id);
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', IMAGE_CACHE);
    res.send(asset.body);
  }
}

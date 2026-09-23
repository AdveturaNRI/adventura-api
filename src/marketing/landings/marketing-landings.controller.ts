import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MarketingLandingsService } from './marketing-landings.service';

/** Public marketing endpoints: no admin or user authentication is required. */
@Controller('marketing/landings')
export class MarketingLandingsController {
  constructor(private readonly landings: MarketingLandingsService) {}

  @Get(':slug/seo.html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async seoHtml(@Param('slug') slug: string, @Res() res: Response) {
    const html = await this.landings.renderSeoHtml(slug);
    return res.status(200).send(html);
  }

  @Get('assets/:assetId')
  async asset(@Param('assetId') assetId: string, @Res() res: Response) {
    const asset = await this.landings.getAsset(assetId);
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.status(200).send(asset.body);
  }

  @Get(':slug')
  getPublished(@Param('slug') slug: string) {
    return this.landings.getPublishedBySlug(slug);
  }
}

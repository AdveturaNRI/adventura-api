import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { PartnersService } from './partners.service';

@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  /** Публичный список активных партнёров для бегущей строки на клиенте. */
  @Get()
  list() {
    return this.partners.listPublic();
  }

  /** Стабильный URL логотипа (без протухающих signed S3 links). */
  @Get(':id/logo')
  async logo(@Param('id') id: string, @Res() res: Response) {
    const asset = await this.partners.getLogoAsset(id);
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.send(asset.body);
  }
}

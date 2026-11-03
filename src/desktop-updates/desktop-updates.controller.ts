import { Body, Controller, Get, Header, NotFoundException, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { S3Service } from '../storage/s3.service';
import { DesktopUpdatesService } from './desktop-updates.service';

@Controller('desktop-updates')
export class DesktopUpdatesController {
  constructor(private readonly s3: S3Service, private readonly updates: DesktopUpdatesService) {}

  @Get('policy')
  @Header('Cache-Control', 'no-store')
  async policy(@Query('platform') platform: string) {
    if (platform !== 'win32' && platform !== 'linux') throw new NotFoundException();
    const policy = await this.updates.getPolicy(platform);
    return policy ? { configured: true, ...policy } : { configured: false };
  }

  @Post('completed')
  async completed(@Body() body: { id?: string; from?: string; to?: string; platform?: string }) {
    await this.updates.recordCompletedUpdate(String(body?.id ?? ''), String(body?.from ?? ''), String(body?.to ?? ''), String(body?.platform ?? ''));
    return { ok: true };
  }

  @Get(':file')
  @Header('Cache-Control', 'no-store')
  async getFile(@Param('file') file: string, @Req() req: Request, @Res() res: Response) {
    if (file === 'latest.yml' || file === 'latest-linux.yml') {
      const manifest = await this.updates.currentManifest(file === 'latest.yml' ? 'win32' : 'linux');
      if (manifest) { res.type('text/yaml').send(manifest); return; }
      try {
        const manifest = await this.s3.getObjectBuffer(`desktop-updates/${file}`);
        res.type('text/yaml').send(manifest);
        return;
      } catch (error) {
        if ((error as { name?: string }).name === 'NoSuchKey') throw new NotFoundException();
        throw error;
      }
    }
    // Only versioned installer names published by our release process are accessible.
    if (!/^Adventura-(?:Setup-)?[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?\.(?:exe|AppImage)(?:\.blockmap)?$/.test(file)) {
      throw new NotFoundException();
    }
    const key = await this.updates.artifactKey(file);
    const url = await this.s3.getSignedObjectUrl(key ?? `desktop-updates/${file}`, 3600);
    if (!file.endsWith('.blockmap') && (!req.headers.range || /^bytes=0-/.test(req.headers.range))) {
      void this.updates.recordDownload(file, req.get('x-adventura-update') === '1' ? 'update' : 'direct').catch(() => undefined);
    }
    res.redirect(302, url);
  }
}

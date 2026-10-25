import { Controller, Get } from '@nestjs/common';

import { AppSettingsService } from './app-settings.service';

@Controller('config')
export class AppSettingsController {
  constructor(private readonly appSettings: AppSettingsService) {}

  /** Public web client config (analytics ids, OAuth client ids). No auth. */
  @Get('public')
  async getPublic() {
    const [yandexMetrika, vkAdsPixel, welcomeLanding] = await Promise.all([
      this.appSettings.getYandexMetrikaPublic(),
      this.appSettings.getVkAdsPixelPublic(),
      this.appSettings.getWelcomeLandingPublic(),
    ]);
    const oauth = this.appSettings.getOauthPublic();
    return { yandexMetrika, vkAdsPixel, welcomeLanding, oauth };
  }
}

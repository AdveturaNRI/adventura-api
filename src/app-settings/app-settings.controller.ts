import { Controller, Get } from '@nestjs/common';

import { AppSettingsService } from './app-settings.service';

@Controller('config')
export class AppSettingsController {
  constructor(private readonly appSettings: AppSettingsService) {}

  /** Public web client config (Metrika, OAuth client ids). No auth. */
  @Get('public')
  async getPublic() {
    const yandexMetrika = await this.appSettings.getYandexMetrikaPublic();
    const oauth = this.appSettings.getOauthPublic();
    return { yandexMetrika, oauth };
  }
}

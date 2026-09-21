import { Controller, Get } from '@nestjs/common';

import { AppSettingsService } from './app-settings.service';

@Controller('config')
export class AppSettingsController {
  constructor(private readonly appSettings: AppSettingsService) {}

  /** Public web client config (Metrika counter, etc.). No auth. */
  @Get('public')
  async getPublic() {
    const yandexMetrika = await this.appSettings.getYandexMetrikaPublic();
    return { yandexMetrika };
  }
}

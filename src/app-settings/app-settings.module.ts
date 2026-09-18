import { Global, Module } from '@nestjs/common';

import { AppSettingsController } from './app-settings.controller';
import { AppSettingsService } from './app-settings.service';

@Global()
@Module({
  controllers: [AppSettingsController],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}

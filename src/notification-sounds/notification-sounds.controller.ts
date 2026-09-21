import { Controller, Get } from '@nestjs/common';

import { NotificationSoundsService } from './notification-sounds.service';

@Controller('notification-sounds')
export class NotificationSoundsController {
  constructor(private readonly notificationSounds: NotificationSoundsService) {}

  @Get()
  list() {
    return this.notificationSounds.listPublicPresets();
  }
}

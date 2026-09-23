import { Controller, Get } from '@nestjs/common';

import { PartnersService } from './partners.service';

@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  /** Публичный список активных партнёров для бегущей строки на клиенте. */
  @Get()
  list() {
    return this.partners.listPublic();
  }
}

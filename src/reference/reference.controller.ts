import { Controller, Get, Query } from '@nestjs/common';

import { SearchCitiesDto } from './dto/search-cities.dto';
import { ReferenceService } from './reference.service';

@Controller('reference')
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get('statuses')
  getStatuses() {
    return this.referenceService.getStatuses();
  }

  @Get('experience-types')
  getExperienceTypes() {
    return this.referenceService.getExperienceTypes();
  }

  @Get('game-systems')
  getGameSystems() {
    return this.referenceService.getGameSystems();
  }

  @Get('cities')
  getCities(@Query() query: SearchCitiesDto) {
    const countryCodes = query.country
      ? query.country
          .split(',')
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean)
      : undefined;

    return this.referenceService.searchCities(query.q, countryCodes, query.limit);
  }

  @Get('upload-limits')
  getUploadLimits() {
    return this.referenceService.getUploadLimits();
  }
}

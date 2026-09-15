import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { ArtStudioService } from './art-studio.service';
import { GenerateArtDto } from './dto/generate-art.dto';

@UseGuards(JwtAuthGuard)
@Controller('art')
export class ArtStudioController {
  constructor(private readonly artStudioService: ArtStudioService) {}

  @Post('generate')
  generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateArtDto) {
    return this.artStudioService.enqueue(user.id, dto);
  }

  @Get('status/:taskId')
  status(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    const view = this.artStudioService.getStatus(user.id, taskId);
    if (!view) {
      throw new NotFoundException('Задача генерации не найдена');
    }
    return view;
  }

  @Delete('tasks/:taskId')
  cancel(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    const view = this.artStudioService.cancel(user.id, taskId);
    if (!view) {
      throw new NotFoundException('Задача генерации не найдена');
    }
    return view;
  }
}

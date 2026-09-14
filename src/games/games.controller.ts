import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../common/upload.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { ApplyGameDto } from './dto/apply-game.dto';
import { CreateGameDto } from './dto/create-game.dto';
import { DeleteGameDto } from './dto/delete-game.dto';
import { ListGamesFeedQueryDto } from './dto/list-games-feed.dto';
import { UpdateGameStatusDto } from './dto/update-game-status.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { GamesService } from './games.service';

@UseGuards(JwtAuthGuard)
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  listFeed(@CurrentUser() user: AuthUser, @Query() query: ListGamesFeedQueryDto) {
    return this.gamesService.listFeed(user.id, query);
  }

  @Get('me')
  listMine(@CurrentUser() user: AuthUser) {
    return this.gamesService.listMine(user.id);
  }

  @Get(':id/manage')
  getManage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gamesService.getManage(user.id, id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gamesService.getForViewer(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGameDto) {
    return this.gamesService.create(user.id, dto);
  }

  @Post(':id/apply')
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApplyGameDto,
  ) {
    return this.gamesService.apply(user.id, id, dto);
  }

  @Delete(':id/application')
  cancelApplication(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gamesService.cancelApplication(user.id, id);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateGameStatusDto,
  ) {
    return this.gamesService.updateStatus(user.id, id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateGameDto,
  ) {
    return this.gamesService.update(user.id, id, dto);
  }

  @Post(':id/applications/:applicationId/accept')
  acceptApplication(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
  ) {
    return this.gamesService.acceptApplication(user.id, id, applicationId);
  }

  @Post(':id/applications/:applicationId/reject')
  rejectApplication(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
  ) {
    return this.gamesService.rejectApplication(user.id, id, applicationId);
  }

  @Delete(':id/players/:userId')
  removePlayer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.gamesService.removePlayer(user.id, id, userId);
  }


  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeleteGameDto,
  ) {
    return this.gamesService.remove(user.id, id, dto);
  }

  @Post(':id/cover')
  @UseInterceptors(
    FileInterceptor('cover', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  uploadCover(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.gamesService.uploadCover(user.id, id, file);
  }

  @Delete(':id/cover')
  deleteCover(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.gamesService.deleteCover(user.id, id);
  }
}

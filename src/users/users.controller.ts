import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
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
import { CreateUserGameSystemDto } from './dto/create-user-game-system.dto';
import { UpdateUserGameSystemDto } from './dto/update-user-game-system.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  ListWanderersQueryDto,
  UpsertWandererReactionDto,
} from './dto/wanderer-reaction.dto';
import { UserGameSystemsService } from './user-game-systems.service';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userGameSystemsService: UserGameSystemsService,
  ) {}

  @Get('wanderers')
  listWanderers(
    @CurrentUser() user: AuthUser,
    @Query() query: ListWanderersQueryDto,
  ) {
    return this.usersService.listWanderers(user.id, query.bucket ?? 'feed');
  }

  @Get('wanderers/counts')
  getWandererBucketCounts(@CurrentUser() user: AuthUser) {
    return this.usersService.getWandererBucketCounts(user.id);
  }

  @Put('wanderers/:targetUserId/reaction')
  upsertWandererReaction(
    @CurrentUser() user: AuthUser,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: UpsertWandererReactionDto,
  ) {
    return this.usersService.upsertWandererReaction(user.id, targetUserId, dto.type);
  }

  @Delete('wanderers/:targetUserId/reaction')
  @HttpCode(200)
  clearWandererReaction(
    @CurrentUser() user: AuthUser,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.usersService.clearWandererReaction(user.id, targetUserId);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get('me/game-systems')
  getMyGameSystems(@CurrentUser() user: AuthUser) {
    return this.userGameSystemsService.listCommunity(user.id);
  }

  @Post('me/game-systems')
  createMyGameSystem(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUserGameSystemDto,
  ) {
    return this.userGameSystemsService.create(user.id, dto.name);
  }

  @Patch('me/game-systems/:id')
  updateMyGameSystem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserGameSystemDto,
  ) {
    return this.userGameSystemsService.update(user.id, id, dto.name);
  }

  @Delete('me/game-systems/:id')
  @HttpCode(200)
  deleteMyGameSystem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.userGameSystemsService.remove(user.id, id);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(user.id, file);
  }

  @Delete('me/avatar')
  @HttpCode(200)
  deleteAvatar(@CurrentUser() user: AuthUser) {
    return this.usersService.deleteAvatar(user.id);
  }

  @Post('me/profile-card')
  @UseInterceptors(
    FileInterceptor('profileCard', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  uploadProfileCard(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadProfileCard(user.id, file);
  }

  @Delete('me/profile-card')
  @HttpCode(200)
  deleteProfileCard(@CurrentUser() user: AuthUser) {
    return this.usersService.deleteProfileCard(user.id);
  }

  @Delete('me/questionnaire')
  @HttpCode(200)
  deleteQuestionnaire(@CurrentUser() user: AuthUser) {
    return this.usersService.deleteQuestionnaire(user.id);
  }

  @Get(':userId/card')
  getUserCard(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
  ) {
    return this.usersService.getWandererCard(user.id, userId);
  }
}

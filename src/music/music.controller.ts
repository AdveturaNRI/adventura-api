import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import {
  AddPlaylistTrackDto,
  CreateMusicPlaylistDto,
  CreateMusicTrackFromUrlDto,
  RefreshMusicTrackUrlsDto,
  ReorderPlaylistTracksDto,
  UpdateMusicPlaylistDto,
  UpdateMusicTrackDto,
} from './dto/music.dto';
import { MAX_MUSIC_TRACK_BYTES, MusicService } from './music.service';

@UseGuards(JwtAuthGuard)
@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Get('tracks')
  listTracks(@CurrentUser() user: AuthUser) {
    return this.musicService.listTracks(user.id);
  }

  @Get('tracks/:trackId')
  getTrack(
    @CurrentUser() user: AuthUser,
    @Param('trackId') trackId: string,
  ) {
    return this.musicService.getTrack(user.id, trackId);
  }

  @Post('tracks/urls')
  refreshTrackUrls(
    @CurrentUser() user: AuthUser,
    @Body() dto: RefreshMusicTrackUrlsDto,
  ) {
    return this.musicService.refreshTrackUrls(user.id, dto.trackIds);
  }

  @Post('tracks/external')
  createTrackFromUrl(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMusicTrackFromUrlDto,
  ) {
    return this.musicService.createTrackFromUrl(user.id, dto);
  }

  @Get('quota')
  getQuota(@CurrentUser() user: AuthUser) {
    return this.musicService.getQuota(user.id);
  }

  @Post('tracks')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_MUSIC_TRACK_BYTES },
    }),
  )
  uploadTrack(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('title') title?: string,
  ) {
    return this.musicService.uploadTrack(user.id, file as Express.Multer.File, title);
  }

  @Patch('tracks/:trackId')
  updateTrack(
    @CurrentUser() user: AuthUser,
    @Param('trackId') trackId: string,
    @Body() dto: UpdateMusicTrackDto,
  ) {
    return this.musicService.updateTrack(user.id, trackId, dto);
  }

  @Delete('tracks/:trackId')
  deleteTrack(
    @CurrentUser() user: AuthUser,
    @Param('trackId') trackId: string,
  ) {
    return this.musicService.deleteTrack(user.id, trackId);
  }

  @Get('playlists')
  listPlaylists(@CurrentUser() user: AuthUser) {
    return this.musicService.listPlaylists(user.id);
  }

  @Post('playlists')
  createPlaylist(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMusicPlaylistDto,
  ) {
    return this.musicService.createPlaylist(user.id, dto);
  }

  @Get('playlists/:playlistId')
  getPlaylist(
    @CurrentUser() user: AuthUser,
    @Param('playlistId') playlistId: string,
  ) {
    return this.musicService.getPlaylist(user.id, playlistId);
  }

  @Patch('playlists/:playlistId')
  updatePlaylist(
    @CurrentUser() user: AuthUser,
    @Param('playlistId') playlistId: string,
    @Body() dto: UpdateMusicPlaylistDto,
  ) {
    return this.musicService.updatePlaylist(user.id, playlistId, dto);
  }

  @Delete('playlists/:playlistId')
  deletePlaylist(
    @CurrentUser() user: AuthUser,
    @Param('playlistId') playlistId: string,
  ) {
    return this.musicService.deletePlaylist(user.id, playlistId);
  }

  @Post('playlists/:playlistId/tracks')
  addTrack(
    @CurrentUser() user: AuthUser,
    @Param('playlistId') playlistId: string,
    @Body() dto: AddPlaylistTrackDto,
  ) {
    return this.musicService.addTrackToPlaylist(user.id, playlistId, dto);
  }

  @Put('playlists/:playlistId/tracks')
  reorderTracks(
    @CurrentUser() user: AuthUser,
    @Param('playlistId') playlistId: string,
    @Body() dto: ReorderPlaylistTracksDto,
  ) {
    return this.musicService.reorderPlaylistTracks(user.id, playlistId, dto);
  }

  @Delete('playlists/:playlistId/tracks/:trackId')
  removeTrack(
    @CurrentUser() user: AuthUser,
    @Param('playlistId') playlistId: string,
    @Param('trackId') trackId: string,
  ) {
    return this.musicService.removeTrackFromPlaylist(
      user.id,
      playlistId,
      trackId,
    );
  }
}

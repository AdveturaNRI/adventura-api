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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../common/upload.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { GeocodeQueryDto } from './dto/geocode-query.dto';
import { GeocodeReverseQueryDto } from './dto/geocode-reverse-query.dto';
import { GeocodeSuggestQueryDto } from './dto/geocode-suggest-query.dto';
import { UpdateClubDto } from './dto/update-club.dto';

@UseGuards(JwtAuthGuard)
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  listMap(@CurrentUser() user: AuthUser) {
    return this.clubsService.listMap(user.id);
  }

  @Get('me')
  listMine(@CurrentUser() user: AuthUser) {
    return this.clubsService.listMine(user.id);
  }

  @Get('geocode/suggest')
  suggestGeocode(@Query() query: GeocodeSuggestQueryDto) {
    return this.clubsService.suggestGeocode(
      query.q,
      query.city,
      query.countrycodes ?? 'ru',
      query.kind ?? 'address',
    );
  }

  @Get('geocode')
  geocode(@Query() query: GeocodeQueryDto) {
    return this.clubsService.geocode(query.q, query.countrycodes ?? 'ru');
  }

  @Get('geocode/reverse')
  reverseGeocode(@Query() query: GeocodeReverseQueryDto) {
    return this.clubsService.reverseGeocode(query.lat, query.lng);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clubsService.getOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClubDto) {
    return this.clubsService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClubDto,
  ) {
    return this.clubsService.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clubsService.remove(user.id, id);
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
    return this.clubsService.uploadCover(user.id, id, file);
  }

  @Delete(':id/cover')
  deleteCover(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clubsService.deleteCover(user.id, id);
  }

  @Post(':id/gallery')
  @UseInterceptors(
    FilesInterceptor('gallery', 8, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  uploadGallery(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.clubsService.uploadGallery(user.id, id, files ?? []);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { DeleteClubDto } from './dto/delete-club.dto';
import { GeocodeQueryDto } from './dto/geocode-query.dto';
import { GeocodeReverseQueryDto } from './dto/geocode-reverse-query.dto';
import { GeocodeSuggestQueryDto } from './dto/geocode-suggest-query.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { ReorderClubGalleryDto } from './dto/reorder-club-gallery.dto';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  listMap(@CurrentUser() user: AuthUser | undefined) {
    return this.clubsService.listMap(user?.id ?? null);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthUser) {
    return this.clubsService.listMine(user!.id);
  }

  @Get('geocode/suggest')
  @UseGuards(JwtAuthGuard)
  suggestGeocode(@Query() query: GeocodeSuggestQueryDto) {
    return this.clubsService.suggestGeocode(
      query.q,
      query.city,
      query.countrycodes ?? 'ru',
      query.kind ?? 'address',
    );
  }

  @Get('geocode')
  @UseGuards(JwtAuthGuard)
  geocode(@Query() query: GeocodeQueryDto) {
    return this.clubsService.geocode(query.q, query.countrycodes ?? 'ru');
  }

  @Get('geocode/reverse')
  @UseGuards(JwtAuthGuard)
  reverseGeocode(@Query() query: GeocodeReverseQueryDto) {
    return this.clubsService.reverseGeocode(query.lat, query.lng);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  getOne(@CurrentUser() user: AuthUser | undefined, @Param('id') id: string) {
    return this.clubsService.getOne(user?.id ?? null, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClubDto) {
    return this.clubsService.create(user!.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClubDto,
  ) {
    return this.clubsService.update(user!.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DeleteClubDto,
  ) {
    return this.clubsService.remove(user!.id, id, dto);
  }

  @Post(':id/cover')
  @UseGuards(JwtAuthGuard)
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
    return this.clubsService.uploadCover(user!.id, id, file);
  }

  @Delete(':id/cover')
  @UseGuards(JwtAuthGuard)
  deleteCover(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clubsService.deleteCover(user!.id, id);
  }

  @Post(':id/gallery')
  @UseGuards(JwtAuthGuard)
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
    return this.clubsService.uploadGallery(user!.id, id, files ?? []);
  }

  @Post(':id/gallery/items')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('gallery', 8, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  addGalleryItems(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.clubsService.addGalleryItems(user!.id, id, files ?? []);
  }

  @Patch(':id/gallery/order')
  @UseGuards(JwtAuthGuard)
  reorderGallery(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReorderClubGalleryDto,
  ) {
    return this.clubsService.reorderGallery(user!.id, id, dto.order);
  }

  @Delete(':id/gallery/:index')
  @UseGuards(JwtAuthGuard)
  deleteGalleryItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.clubsService.deleteGalleryItem(user!.id, id, index);
  }
}

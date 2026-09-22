import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../common/upload.constants';
import { AuthorsService } from './authors.service';
import { CreateAuthorPostDto } from './dto/create-author-post.dto';
import { ListAuthorPostsQueryDto } from './dto/list-author-posts-query.dto';
import { UpdateAuthorPostDto } from './dto/update-author-post.dto';
import { UpdateAuthorProfileDto } from './dto/update-author-profile.dto';

@UseGuards(JwtAuthGuard)
@Controller('authors')
export class AuthorsController {
  constructor(private readonly authorsService: AuthorsService) {}

  @Get('posts')
  listPosts(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAuthorPostsQueryDto,
  ) {
    return this.authorsService.listPosts(user.id, query.category);
  }

  @Get('posts/:postId')
  getPost(@CurrentUser() user: AuthUser, @Param('postId') postId: string) {
    return this.authorsService.getPost(user.id, postId);
  }

  @Post('posts/:postId/like')
  toggleLike(@CurrentUser() user: AuthUser, @Param('postId') postId: string) {
    return this.authorsService.toggleLike(user.id, postId);
  }

  @Post('posts/:postId/view')
  incrementViews(@Param('postId') postId: string) {
    return this.authorsService.incrementViews(postId);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.authorsService.getMe(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateAuthorProfileDto) {
    return this.authorsService.updateMe(user.id, dto);
  }

  @Post('me/posts')
  createPost(@CurrentUser() user: AuthUser, @Body() dto: CreateAuthorPostDto) {
    return this.authorsService.createPost(user.id, dto);
  }

  @Patch('me/posts/:postId')
  updatePost(
    @CurrentUser() user: AuthUser,
    @Param('postId') postId: string,
    @Body() dto: UpdateAuthorPostDto,
  ) {
    return this.authorsService.updatePost(user.id, postId, dto);
  }

  @Delete('me/posts/:postId')
  deletePost(@CurrentUser() user: AuthUser, @Param('postId') postId: string) {
    return this.authorsService.deletePost(user.id, postId);
  }

  @Post('me/posts/:postId/images')
  @UseInterceptors(
    FilesInterceptor('images', 8, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  uploadImages(
    @CurrentUser() user: AuthUser,
    @Param('postId') postId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.authorsService.uploadImages(user.id, postId, files ?? []);
  }

  @Post('me/posts/:postId/files')
  @UseInterceptors(
    FilesInterceptor('files', 8, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
    }),
  )
  uploadFiles(
    @CurrentUser() user: AuthUser,
    @Param('postId') postId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.authorsService.uploadFiles(user.id, postId, files ?? []);
  }

  @Get()
  listAuthors(@CurrentUser() user: AuthUser) {
    return this.authorsService.listAuthors(user.id);
  }

  @Get(':id/posts')
  listAuthorPosts(
    @CurrentUser() user: AuthUser,
    @Param('id') authorId: string,
  ) {
    return this.authorsService.listAuthorPosts(user.id, authorId);
  }

  @Get(':id')
  getAuthor(@CurrentUser() user: AuthUser, @Param('id') authorId: string) {
    return this.authorsService.getAuthor(user.id, authorId);
  }
}

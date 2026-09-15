import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-response.type';
import { MAX_UPLOAD_FILE_SIZE_BYTES } from '../common/upload.constants';
import { CreateGroupDto } from './dto/create-group.dto';
import { DeleteConversationQueryDto } from './dto/delete-conversation.dto';
import { ListMessagesQueryDto } from './dto/list-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatsService } from './chats.service';

@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.chatsService.listConversations(user.id);
  }

  @Post('groups')
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.chatsService.createGroup(user.id, dto.title, dto.memberIds);
  }

  @Post('games/:gameId')
  openGameChat(@CurrentUser() user: AuthUser, @Param('gameId') gameId: string) {
    return this.chatsService.openGameChat(user.id, gameId);
  }

  @Post('with/:userId')
  findOrCreate(@CurrentUser() user: AuthUser, @Param('userId') peerUserId: string) {
    return this.chatsService.findOrCreateWith(user.id, peerUserId);
  }

  @Delete('with/:userId/block')
  unblockPeerByUserId(@CurrentUser() user: AuthUser, @Param('userId') peerUserId: string) {
    return this.chatsService.unblockPeerByUserId(user.id, peerUserId);
  }

  @Get(':id/members')
  listMembers(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.listMembers(user.id, conversationId);
  }

  @Post(':id/leave')
  leaveGroup(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.leaveGroup(user.id, conversationId);
  }

  @Get(':id/messages')
  listMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.chatsService.listMessages(
      user.id,
      conversationId,
      query.cursor,
      query.limit ?? 40,
    );
  }

  @Post(':id/messages')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: 10 },
        { name: 'file', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: MAX_UPLOAD_FILE_SIZE_BYTES },
      },
    ),
  )
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
    @UploadedFiles()
    uploaded?: {
      files?: Express.Multer.File[];
      file?: Express.Multer.File[];
    },
  ) {
    const files = [...(uploaded?.files ?? []), ...(uploaded?.file ?? [])];
    return this.chatsService.sendMessage(user.id, conversationId, dto.body, files, {
      voiceDurationSec: dto.voiceDurationSec,
      voiceWaveform: dto.voiceWaveform,
    });
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.markRead(user.id, conversationId);
  }

  @Post(':id/block')
  blockPeer(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.blockPeer(user.id, conversationId);
  }

  @Delete(':id/block')
  unblockPeer(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.unblockPeer(user.id, conversationId);
  }

  @Delete(':id')
  deleteConversation(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Query() query: DeleteConversationQueryDto,
  ) {
    return this.chatsService.deleteConversation(
      user.id,
      conversationId,
      query.forEveryone === true,
    );
  }
}

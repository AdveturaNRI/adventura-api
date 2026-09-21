import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { ForwardMessagesDto } from './dto/forward-messages.dto';
import {
  AddGroupMembersDto,
  RenameGroupDto,
  SetGroupMemberRoleDto,
} from './dto/group-manage.dto';
import { ListMessagesQueryDto } from './dto/list-messages.dto';
import { ReorderPinnedChatsDto } from './dto/reorder-pinned-chats.dto';
import { SendDiceRollDto } from './dto/send-dice-roll.dto';
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

  @Put('pins/order')
  reorderPinned(@CurrentUser() user: AuthUser, @Body() dto: ReorderPinnedChatsDto) {
    return this.chatsService.reorderPinnedConversations(user.id, dto.conversationIds);
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

  @Post(':id/pin')
  pin(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.pinConversation(user.id, conversationId);
  }

  @Delete(':id/pin')
  unpin(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.unpinConversation(user.id, conversationId);
  }

  @Get(':id/members')
  listMembers(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.listMembers(user.id, conversationId);
  }

  @Put(':id')
  renameGroup(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: RenameGroupDto,
  ) {
    return this.chatsService.renameGroup(user.id, conversationId, dto.title);
  }

  @Post(':id/members')
  addGroupMembers(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: AddGroupMembersDto,
  ) {
    return this.chatsService.addGroupMembers(user.id, conversationId, dto.memberIds);
  }

  @Delete(':id/members/:userId')
  removeGroupMember(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.chatsService.removeGroupMember(user.id, conversationId, targetUserId);
  }

  @Put(':id/members/:userId/role')
  setGroupMemberRole(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: SetGroupMemberRoleDto,
  ) {
    return this.chatsService.setGroupMemberRole(
      user.id,
      conversationId,
      targetUserId,
      dto.role,
    );
  }

  @Post(':id/transfer')
  transferGroupOwnership(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() body: { userId?: string },
  ) {
    return this.chatsService.transferGroupOwnership(
      user.id,
      conversationId,
      body.userId ?? '',
    );
  }

  @Delete(':id/group')
  deleteGroup(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.deleteGroup(user.id, conversationId);
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
    return this.chatsService.sendMessage(
      user.id,
      conversationId,
      dto.body,
      files,
      dto.replyToId,
      {
        voiceDurationSec: dto.voiceDurationSec,
        voiceWaveform: dto.voiceWaveform,
      },
    );
  }

  @Post(':id/dice-rolls')
  sendDiceRoll(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: SendDiceRollDto,
  ) {
    return this.chatsService.sendDiceRoll(user.id, conversationId, dto);
  }

  @Post(':id/forward')
  forwardMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() dto: ForwardMessagesDto,
  ) {
    return this.chatsService.forwardMessages(user.id, conversationId, dto.messageIds);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.markRead(user.id, conversationId);
  }

  /** LiveKit token for in-chat voice. Room is created on first join. */
  @Post(':id/voice/token')
  createVoiceToken(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.createVoiceToken(user.id, conversationId);
  }

  @Post(':id/voice/invite')
  inviteVoiceCall(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.inviteVoiceCall(user.id, conversationId);
  }

  @Get(':id/voice/active')
  getActiveVoiceCall(@CurrentUser() user: AuthUser, @Param('id') conversationId: string) {
    return this.chatsService.getActiveVoiceCall(user.id, conversationId);
  }

  @Post(':id/voice/accept')
  acceptVoiceCall(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() body: { callId?: string },
  ) {
    return this.chatsService.acceptVoiceCall(user.id, conversationId, body.callId ?? '');
  }

  @Post(':id/voice/join')
  joinVoiceCall(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() body: { callId?: string },
  ) {
    return this.chatsService.joinVoiceCall(user.id, conversationId, body.callId);
  }

  @Post(':id/voice/decline')
  declineVoiceCall(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() body: { callId?: string },
  ) {
    return this.chatsService.declineVoiceCall(user.id, conversationId, body.callId ?? '');
  }

  @Post(':id/voice/end')
  endVoiceCall(
    @CurrentUser() user: AuthUser,
    @Param('id') conversationId: string,
    @Body() body: { callId?: string },
  ) {
    return this.chatsService.endVoiceCall(user.id, conversationId, body.callId ?? '');
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

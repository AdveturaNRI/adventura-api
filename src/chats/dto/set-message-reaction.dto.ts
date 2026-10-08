import { IsIn, IsString } from 'class-validator';

export const CHAT_REACTION_EMOJIS = [
  '❤️',
  '👍',
  '😂',
  '😮',
  '😢',
  '🔥',
  '🎉',
  '🥰',
  '😍',
  '😡',
  '🙏',
  '💯',
  '🤔',
  '👀',
  '🥳',
  '👏',
  '🤝',
  '✨',
  '💔',
  '🤗',
  '😎',
  '🙌',
  '💩',
] as const;

export class SetMessageReactionDto {
  @IsString()
  @IsIn(CHAT_REACTION_EMOJIS)
  emoji!: (typeof CHAT_REACTION_EMOJIS)[number];
}

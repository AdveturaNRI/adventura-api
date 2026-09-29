import { CHAT_REACTION_EMOJIS } from './dto/set-message-reaction.dto';

export function orderChatReactionEmojis(
  usage: Array<{ emoji: string; useCount: number }>,
): string[] {
  const counts = new Map(usage.map((item) => [item.emoji, item.useCount]));
  return CHAT_REACTION_EMOJIS.map((emoji, defaultIndex) => ({
    emoji,
    defaultIndex,
    useCount: counts.get(emoji) ?? 0,
  }))
    .sort((a, b) => b.useCount - a.useCount || a.defaultIndex - b.defaultIndex)
    .map((item) => item.emoji);
}

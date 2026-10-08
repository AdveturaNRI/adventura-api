import { orderChatReactionEmojis } from './chat-reactions.util';
import { CHAT_REACTION_EMOJIS } from './dto/set-message-reaction.dto';

describe('orderChatReactionEmojis', () => {
  it('sorts by account usage and keeps stable defaults for ties and unused reactions', () => {
    const result = orderChatReactionEmojis([
      { emoji: '😂', useCount: 8 },
      { emoji: '👍', useCount: 3 },
      { emoji: '👀', useCount: 8 },
      { emoji: 'not-an-emoji', useCount: 100 },
    ]);

    expect(result.slice(0, 3)).toEqual(['😂', '👀', '👍']);
    expect(result).toHaveLength(CHAT_REACTION_EMOJIS.length);
    expect(result.slice(3)).toEqual(CHAT_REACTION_EMOJIS.filter((emoji) => !['😂', '👀', '👍'].includes(emoji)));
  });
});

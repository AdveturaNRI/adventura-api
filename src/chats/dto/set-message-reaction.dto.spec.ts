import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SetMessageReactionDto } from './set-message-reaction.dto';

describe('SetMessageReactionDto', () => {
  it.each([
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
  ])('accepts reaction %s', async (emoji) => {
    const dto = plainToInstance(SetMessageReactionDto, { emoji });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['', '🙃', '❤️❤️', 'hello', 42])(
    'rejects unsupported reaction %s',
    async (emoji) => {
      const dto = plainToInstance(SetMessageReactionDto, { emoji });
      await expect(validate(dto)).resolves.not.toHaveLength(0);
    },
  );
});

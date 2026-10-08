import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MarkVisibleMessagesReadDto } from './mark-visible-messages-read.dto';

describe('MarkVisibleMessagesReadDto', () => {
  it('accepts a small list of message ids', async () => {
    const dto = plainToInstance(MarkVisibleMessagesReadDto, {
      messageIds: ['message-1', 'message-2'],
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects duplicate ids and oversized lists', async () => {
    const duplicate = plainToInstance(MarkVisibleMessagesReadDto, {
      messageIds: ['message-1', 'message-1'],
    });
    const oversized = plainToInstance(MarkVisibleMessagesReadDto, {
      messageIds: Array.from({ length: 101 }, (_, index) => `message-${index}`),
    });
    await expect(validate(duplicate)).resolves.not.toHaveLength(0);
    await expect(validate(oversized)).resolves.not.toHaveLength(0);
  });
});

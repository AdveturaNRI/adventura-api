import { normalizeGameSystemName } from '../common/utils/game-system-name.utils';

describe('normalizeGameSystemName', () => {
  it('treats spaced and cased names as the same key', () => {
    expect(normalizeGameSystemName('PbtA')).toBe('pbta');
    expect(normalizeGameSystemName(' PB TA ')).toBe('pbta');
  });
});

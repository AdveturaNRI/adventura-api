import {
  DEFAULT_ANNOUNCEMENT_THEME,
  normalizeAnnouncementTheme,
  sanitizeActionUrl,
  sanitizeAnnouncementBody,
} from './announcement-theme';

describe('normalizeAnnouncementTheme', () => {
  it('returns defaults for empty input', () => {
    expect(normalizeAnnouncementTheme(null)).toEqual(
      DEFAULT_ANNOUNCEMENT_THEME,
    );
    expect(normalizeAnnouncementTheme({})).toEqual(DEFAULT_ANNOUNCEMENT_THEME);
  });

  it('clamps width and radius', () => {
    const theme = normalizeAnnouncementTheme({
      modalWidth: 9999,
      borderRadius: -5,
    });
    expect(theme.modalWidth).toBe(720);
    expect(theme.borderRadius).toBe(0);
  });

  it('rejects invalid colors', () => {
    const theme = normalizeAnnouncementTheme({
      backgroundColor: 'red',
      titleColor: '#abc',
    });
    expect(theme.backgroundColor).toBe(
      DEFAULT_ANNOUNCEMENT_THEME.backgroundColor,
    );
    expect(theme.titleColor).toBe('#abc');
  });
});

describe('sanitizeActionUrl', () => {
  it('allows https and app paths', () => {
    expect(sanitizeActionUrl('https://example.com/x')).toBe(
      'https://example.com/x',
    );
    expect(sanitizeActionUrl('/games')).toBe('/games');
  });

  it('rejects javascript and protocol-relative', () => {
    expect(sanitizeActionUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeActionUrl('//evil.com')).toBeNull();
    expect(sanitizeActionUrl('ftp://x')).toBeNull();
  });
});

describe('sanitizeAnnouncementBody', () => {
  it('strips scripts and event handlers', () => {
    const cleaned = sanitizeAnnouncementBody(
      '<p onclick="alert(1)">Hi</p><script>evil()</script><strong>ok</strong>',
    );
    expect(cleaned).not.toMatch(/script/i);
    expect(cleaned).not.toMatch(/onclick/i);
    expect(cleaned).toContain('<strong>ok</strong>');
  });

  it('keeps safe links only', () => {
    const cleaned = sanitizeAnnouncementBody(
      '<a href="javascript:alert(1)">bad</a><a href="https://ok.test">good</a>',
    );
    expect(cleaned).toContain('https://ok.test');
    expect(cleaned).not.toMatch(/javascript/i);
  });
});

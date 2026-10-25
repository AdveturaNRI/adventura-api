export function isSafeMarketingUrl(value) {
  if (!value) return true;
  if (typeof value !== 'string' || /[\\\u0000-\u0020]/.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  if (value.startsWith('#')) return true;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

export function validateMarketingContent(value) {
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    for (const [key, item] of Object.entries(node)) {
      if ((/url$/i.test(key) || key === 'canonical' || key === 'faqAnchor') && !isSafeMarketingUrl(item)) throw new Error(`Недопустимый URL: ${key}`);
      if (['items', 'groups', 'socials', 'links'].includes(key) && item != null && !Array.isArray(item)) throw new Error(`${key} должен быть массивом`);
      if (key === 'accentColor' && item && !/^#[0-9a-f]{3,8}$/i.test(item)) throw new Error('Цвет должен быть в HEX-формате');
      visit(item);
    }
    if (node.type === 'introColumns' && node.columns != null && !Array.isArray(node.columns)) throw new Error('columns должен быть массивом');
    if (['gameFeed', 'clubFeed', 'wandererFeed', 'publicationFeed'].includes(node.type)) {
      if (node.layout != null && !['grid', 'carousel'].includes(node.layout)) throw new Error('Неизвестный layout');
      if (node.limit != null && (!Number.isInteger(node.limit) || node.limit < 1 || node.limit > 50)) throw new Error('limit: целое число от 1 до 50');
      if (node.cardWidth != null && (!Number.isFinite(node.cardWidth) || node.cardWidth < 180 || node.cardWidth > 420)) throw new Error('cardWidth: от 180 до 420');
    }
  }
  visit(value);
}

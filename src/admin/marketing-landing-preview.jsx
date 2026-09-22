/** Shared Adventura landing theme + HTML preview for AdminJS (mirrors client tokens). */

const PALETTES = {
  light: {
    text: '#000000',
    textSecondary: '#4C4C4C',
    textMuted: '#727272',
    border: '#E8E8E8',
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#FBFBFB',
    placeholderAlt: '#EEEEEE',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#B7C2D0',
    textMuted: '#7E8B9C',
    border: 'rgba(255,255,255,0.08)',
    background: '#0B111B',
    surface: '#182230',
    surfaceMuted: '#121A26',
    placeholderAlt: '#1E2A3A',
  },
};

const ACCENTS = {
  adventura: '#157AFE',
  indigo: '#9562F5',
  teal: '#30B0C7',
};

function normalizeTheme(raw) {
  const mode = raw?.mode === 'dark' ? 'dark' : 'light';
  const background =
    raw?.background === 'muted' ||
    raw?.background === 'soft-blue' ||
    raw?.background === 'image'
      ? raw.background
      : 'solid';
  const accent =
    raw?.accent === 'indigo' || raw?.accent === 'teal' ? raw.accent : 'adventura';
  const backgroundImageUrl =
    typeof raw?.backgroundImageUrl === 'string' && raw.backgroundImageUrl.trim()
      ? raw.backgroundImageUrl.trim()
      : '';
  const skin = raw?.skin === 'app' ? 'app' : 'fantasy';
  return { mode, background, accent, backgroundImageUrl, skin };
}

function resolveTheme(raw) {
  const n = normalizeTheme(raw);
  const base = PALETTES[n.mode];
  const accentColor = ACCENTS[n.accent];
  let pageBackground = base.background;
  if (n.background === 'muted') pageBackground = base.surfaceMuted;
  if (n.background === 'soft-blue') {
    pageBackground = n.mode === 'dark' ? '#0B1220' : '#F2F7FF';
  }
  return {
    ...n,
    ...base,
    accentColor,
    accentOn: '#FFFFFF',
    pageBackground,
    heroBackground: accentColor,
    blockBackground: base.surface,
    blockBorder: base.border,
    itemBackground: base.surfaceMuted,
    quoteBackground: n.mode === 'dark' ? '#0B1220' : '#F2F7FF',
  };
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BLOCK_LABELS = {
  hero: 'Главный экран',
  features: 'Преимущества',
  steps: 'Как это работает',
  gameFeed: 'Лента игр',
  clubFeed: 'Лента клубов',
  testimonials: 'Отзывы',
  faq: 'Вопросы и ответы',
  stats: 'Цифры',
  quote: 'Цитата',
  cta: 'Кнопка действия',
  media: 'Картинка',
};

function sectionHeader(typeLabel, title, description) {
  return `<div class="type-tag">${typeLabel}</div>
    ${title ? `<h2>${title}</h2>` : ''}
    ${description ? `<p class="muted">${description}</p>` : ''}`;
}

function renderBlockHtml(block) {
  const type = block?.type || 'block';
  const title = esc(block?.title || '');
  const description = esc(block?.description || '');
  const ctaLabel = esc(block?.ctaLabel || '');
  const imageUrl = esc(block?.imageUrl || '');
  const typeLabel = esc(BLOCK_LABELS[type] || type);
  const items = Array.isArray(block?.items) ? block.items : [];

  if (type === 'hero') {
    return `<section class="block hero">
      <div class="type-tag">${typeLabel}</div>
      ${imageUrl ? `<div class="media"><img src="${imageUrl}" alt="" /></div>` : ''}
      <h1>${title || 'Adventura'}</h1>
      ${description ? `<p class="copy">${description}</p>` : ''}
      ${ctaLabel ? `<span class="cta cta-hero">${ctaLabel}</span>` : ''}
      ${!title && !description && !ctaLabel ? `<p class="copy" style="opacity:.7">Заполни заголовок и кнопку слева</p>` : ''}
    </section>`;
  }

  if (type === 'features') {
    const cards =
      items
        .map((item, idx) => {
          const emoji = esc(item?.meta || '✦');
          const it = esc(item?.title || `Преимущество ${idx + 1}`);
          const idesc = esc(item?.description || '');
          return `<div class="feature"><div class="emoji">${emoji}</div><strong>${it}</strong>${
            idesc ? `<div class="item-copy">${idesc}</div>` : ''
          }</div>`;
        })
        .join('') || `<p class="hint">Добавь пункты преимуществ слева</p>`;
    return `<section class="block">
      ${sectionHeader(typeLabel, title, description)}
      <div class="features">${cards}</div>
    </section>`;
  }

  if (type === 'steps') {
    const rows =
      items
        .map((item, idx) => {
          const it = esc(item?.title || `Шаг ${idx + 1}`);
          const idesc = esc(item?.description || '');
          return `<div class="step"><div class="badge">${idx + 1}</div><div><strong>${it}</strong>${
            idesc ? `<div class="item-copy">${idesc}</div>` : ''
          }</div></div>`;
        })
        .join('') || `<p class="hint">Добавь шаги слева</p>`;
    return `<section class="block">
      ${sectionHeader(typeLabel, title, description)}
      <div class="steps">${rows}</div>
    </section>`;
  }

  if (type === 'testimonials') {
    const cards =
      items
        .map((item, idx) => {
          const author = esc(item?.title || 'Игрок');
          const quote = esc(item?.description || '');
          const meta = esc(item?.meta || '');
          return `<div class="testimonial"><div class="qmark">“</div>${
            quote ? `<p class="quote-text">${quote}</p>` : ''
          }<div class="author">${author}</div>${
            meta ? `<div class="item-copy">${meta}</div>` : ''
          }</div>`;
        })
        .join('') || `<p class="hint">Добавь отзывы слева</p>`;
    return `<section class="block">
      ${sectionHeader(typeLabel, title, description)}
      <div class="items">${cards}</div>
    </section>`;
  }

  if (type === 'faq') {
    const rows =
      items
        .map((item, idx) => {
          const q = esc(item?.title || `Вопрос ${idx + 1}`);
          const a = esc(item?.description || '');
          return `<div class="faq"><div class="faq-q">В: ${q}</div>${
            a ? `<div class="faq-a">О: ${a}</div>` : ''
          }</div>`;
        })
        .join('') || `<p class="hint">Добавь вопросы и ответы слева</p>`;
    return `<section class="block">
      ${sectionHeader(typeLabel, title, description)}
      <div class="items">${rows}</div>
    </section>`;
  }

  if (type === 'stats') {
    const cards =
      items
        .map((item) => {
          const value = esc(item?.title || '—');
          const label = esc(item?.description || '');
          return `<div class="stat"><div class="stat-value">${value}</div>${
            label ? `<div class="stat-label">${label}</div>` : ''
          }</div>`;
        })
        .join('') || `<p class="hint">Добавь цифры слева</p>`;
    return `<section class="block">
      ${sectionHeader(typeLabel, title, description)}
      <div class="stats">${cards}</div>
    </section>`;
  }

  if (type === 'quote') {
    const author = esc(block?.author || '');
    const quoteText = description || title;
    return `<section class="block quote-block">
      <div class="type-tag">${typeLabel}</div>
      <div class="qmark">“</div>
      ${quoteText ? `<p class="quote-lg">${quoteText}</p>` : '<p class="hint">Текст цитаты</p>'}
      ${author ? `<div class="quote-author">— ${author}</div>` : ''}
    </section>`;
  }

  if (type === 'cta') {
    return `<section class="block">
      <div class="type-tag">${typeLabel}</div>
      ${title ? `<h2>${title}</h2>` : ''}
      ${description ? `<p class="muted">${description}</p>` : ''}
      ${ctaLabel ? `<span class="cta cta-surface">${ctaLabel}</span>` : ''}
    </section>`;
  }

  if (type === 'media') {
    return `<section class="block">
      <div class="type-tag">${typeLabel}</div>
      ${title ? `<h2>${title}</h2>` : ''}
      ${description ? `<p class="muted">${description}</p>` : ''}
      ${imageUrl ? `<div class="media"><img src="${imageUrl}" alt="" /></div>` : '<p class="hint">Укажи URL картинки</p>'}
    </section>`;
  }

  if (type === 'gameFeed' || type === 'clubFeed') {
    return `<section class="block">
      ${sectionHeader(typeLabel, title, description)}
      <div class="feed-card"><div class="feed-cover"></div><div><strong>${
        type === 'gameFeed' ? 'Карточки игр с API' : 'Карточки клубов с API'
      }</strong><div class="item-copy">На сайте подтянутся автоматически</div></div></div>
    </section>`;
  }

  return `<section class="block">
    ${sectionHeader(typeLabel, title || esc(type), description)}
  </section>`;
}

function buildPreviewHtml(content, { mobile = false } = {}) {
  const theme = resolveTheme(content?.theme);
  const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
  const hasBgImage =
    theme.background === 'image' && Boolean(theme.backgroundImageUrl);
  const overlayBg =
    theme.mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.72)';

  const css = `
    *{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      background:${esc(theme.pageBackground)};color:${esc(theme.text)};position:relative;min-height:100%}
    .bg-image{position:fixed;inset:0;background-image:url('${esc(
      theme.backgroundImageUrl || '',
    )}');background-size:cover;background-position:center;z-index:0}
    .overlay{position:fixed;inset:0;background:${overlayBg};z-index:1}
    .wrap{position:relative;z-index:2;max-width:${
      mobile ? '390px' : '1200px'
    };margin:0 auto;padding:16px 16px 32px;display:grid;grid-template-columns:${
      mobile ? '1fr' : 'repeat(2,minmax(0,1fr))'
    };gap:16px;align-items:start}
    .block{background:${esc(theme.blockBackground)};border:1px solid ${esc(
      theme.blockBorder,
    )};border-radius:18px;padding:24px;display:grid;gap:14px;position:relative;min-width:0}
    .type-hero,.type-cta,.type-media,.type-quote,.type-footer{grid-column:1/-1}
    .type-tag{font-size:11px;font-weight:700;letter-spacing:.02em;color:${esc(
      theme.accentColor,
    )};opacity:.9}
    .hero{background:${esc(
      theme.heroBackground,
    )};border-color:transparent;color:${esc(theme.accentOn)};padding:42px 24px}
    .hero .type-tag{color:${esc(theme.accentOn)};opacity:.8}
    h1{margin:0;font-size:34px;line-height:1.15;letter-spacing:-0.5px;font-weight:800}
    h2{margin:0;font-size:22px;letter-spacing:-0.3px;color:${esc(
      theme.text,
    )};font-weight:700}
    .copy{margin:0;opacity:.95;line-height:1.5;font-size:16px}
    .muted{margin:0;color:${esc(theme.textSecondary)};line-height:1.5;font-size:16px}
    .hint{margin:0;color:${esc(theme.textMuted)};font-size:13px;font-style:italic}
    .cta{display:inline-block;border-radius:999px;padding:12px 18px;font-weight:700;font-size:14px}
    .cta-hero{background:${esc(theme.accentOn)};color:${esc(theme.accentColor)}}
    .cta-surface{background:${esc(theme.accentColor)};color:${esc(theme.accentOn)}}
    .items{display:grid;gap:10px}
    .item-copy{color:${esc(theme.textSecondary)};font-size:13px;margin-top:4px;line-height:1.45}
    .features{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
    .feature{background:${esc(theme.itemBackground)};border:1px solid ${esc(
      theme.blockBorder,
    )};border-left:3px solid ${esc(
      theme.accentColor,
    )};border-radius:14px;padding:14px;display:grid;gap:6px}
    .emoji{font-size:20px;line-height:1.2}
    .steps{display:grid;gap:4px}
    .step{display:grid;grid-template-columns:36px 1fr;gap:12px;align-items:start;padding:8px 0}
    .badge{width:36px;height:36px;border-radius:999px;background:${esc(
      theme.accentColor,
    )};color:${esc(
      theme.accentOn,
    )};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px}
    .testimonial{background:${esc(theme.itemBackground)};border:1px solid ${esc(
      theme.blockBorder,
    )};border-radius:16px;padding:18px;display:grid;gap:8px}
    .qmark{color:${esc(theme.accentColor)};font-size:40px;font-weight:800;line-height:28px;opacity:.85}
    .quote-text{margin:0;font-size:17px;line-height:1.5;font-style:italic;color:${esc(
      theme.text,
    )}}
    .author{font-weight:700;font-size:14px;margin-top:4px}
    .faq{background:${esc(theme.itemBackground)};border:1px solid ${esc(
      theme.blockBorder,
    )};border-radius:14px;padding:14px;display:grid;gap:8px}
    .faq-q{font-weight:700;font-size:14px;line-height:1.4}
    .faq-a{font-size:13px;color:${esc(
      theme.textSecondary,
    )};line-height:1.5;border-top:1px solid ${esc(
      theme.blockBorder,
    )};padding-top:10px;margin-top:2px}
    .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
    .stat{background:${esc(theme.itemBackground)};border:1px solid ${esc(
      theme.blockBorder,
    )};border-radius:16px;padding:18px 12px;text-align:center}
    .stat-value{font-size:28px;font-weight:800;color:${esc(
      theme.accentColor,
    )};letter-spacing:-.5px;line-height:1.1}
    .stat-label{font-size:12px;color:${esc(
      theme.textSecondary,
    )};margin-top:6px;line-height:1.35}
    .quote-block{background:${esc(theme.quoteBackground)};border-color:transparent;padding:32px 24px}
    .quote-lg{margin:0;font-size:22px;line-height:1.4;font-weight:600;letter-spacing:-.3px}
    .quote-author{color:${esc(theme.accentColor)};font-weight:700;font-size:14px}
    .media{aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:${esc(
      theme.itemBackground,
    )}}
    .media img{width:100%;height:100%;object-fit:cover;display:block}
    .feed-card{display:flex;gap:12px;align-items:center;padding:14px;border-radius:16px;
      background:${esc(theme.itemBackground)};border:1px solid ${esc(theme.blockBorder)}}
    .feed-cover{width:88px;height:66px;border-radius:12px;background:${esc(
      theme.placeholderAlt,
    )};flex-shrink:0}
    @media(max-width:700px){.wrap{grid-template-columns:1fr;padding:10px;gap:10px}.type-hero,.type-cta,.type-media,.type-quote,.type-footer{grid-column:auto}.block{padding:18px}.hero{padding:30px 18px}}
  `;

  const body =
    blocks
      .map((b) =>
        renderBlockHtml(b).replace(
          /class="block/g,
          `class="block type-${esc(b?.type || 'block')}`,
        ),
      )
      .join('') ||
    `<section class="block"><p class="muted">Добавьте блоки — превью появится здесь.</p></section>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css}</style></head>
    <body>
      ${hasBgImage ? `<div class="bg-image"></div><div class="overlay"></div>` : ''}
      <div class="wrap">${body}</div>
    </body></html>`;
}

export {
  normalizeTheme,
  resolveTheme,
  buildPreviewHtml,
  BLOCK_LABELS,
  ACCENTS,
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Box, Button, Header, Input, Label, MessageBox, Select, Text, TextArea } from '@adminjs/design-system';
import { buildPreviewHtml, normalizeTheme } from './marketing-landing-preview';

const api = new ApiClient();
const PAGE_NAME = 'marketingLandings';

const defaultTheme = {
  mode: 'dark',
  background: 'solid',
  accent: 'adventura',
  skin: 'fantasy',
  backgroundImageUrl: '',
};

const empty = {
  name: '',
  slug: '',
  description: '',
  draftContent: { blocks: [], theme: { ...defaultTheme } },
  draftSeo: { title: '', description: '', image: '', canonical: '', robots: 'index,follow' },
};

const BLOCK_META = {
  hero: {
    label: 'Главный экран',
    hint: 'Широкий hero: заголовок, 2 CTA, картинка справа/фон.',
    fields: ['title', 'description', 'ctaLabel', 'ctaUrl', 'secondaryCtaLabel', 'secondaryCtaUrl', 'imageUrl', 'imagePosition', 'trustText', 'eyebrow'],
    titlePh: 'Настоящие люди. Реальные приключения.',
  },
  features: {
    label: 'Преимущества',
    hint: 'Сетка карточек. meta: people/dice/chat/planet',
    fields: ['title', 'description'],
    hasItems: true,
    itemKind: 'feature',
    itemTitlePh: 'Название',
    itemDescPh: 'Описание',
    itemMetaPh: 'people | dice | chat | planet',
    itemMetaLabel: 'Ключ иконки',
  },
  appShowcase: {
    label: 'Демо приложения',
    hint: 'Текст + скриншоты. imageSide: left|right',
    fields: ['title', 'description', 'ctaLabel', 'ctaUrl', 'imageUrl', 'imageUrlSecondary', 'imageSide'],
  },
  steps: {
    label: 'Как это работает',
    hint: 'Нумерованные шаги.',
    fields: ['title', 'description'],
    hasItems: true,
    itemKind: 'step',
    itemTitlePh: 'Шаг',
    itemDescPh: 'Описание',
    itemMetaPh: 'person | search | hand | game',
  },
  gameFeed: {
    label: 'Лента игр',
    hint: 'Живые игры с API.',
    fields: ['title', 'description', 'limit', 'ctaLabel', 'ctaUrl'],
  },
  testimonials: {
    label: 'Отзывы',
    hint: 'Заголовок задаёт название секции. Сам отзыв добавь ниже: имя, роль, цитата и аватар.',
    fields: ['title', 'description'],
    hasItems: true,
    itemKind: 'testimonial',
    itemTitlePh: 'Имя',
    itemDescPh: 'Цитата',
    itemMetaPh: 'Роль',
  },
  clubFeed: {
    label: 'Лента клубов',
    hint: 'Живые клубы с API.',
    fields: ['title', 'description', 'limit', 'ctaLabel', 'ctaUrl'],
  },
  cta: {
    label: 'Призыв к действию',
    hint: 'Широкий баннер.',
    fields: ['title', 'description', 'ctaLabel', 'ctaUrl', 'secondaryCtaLabel', 'secondaryCtaUrl', 'imageUrl'],
  },
  faq: {
    label: 'Вопросы и ответы',
    hint: 'Аккордеон.',
    fields: ['title', 'description'],
    hasItems: true,
    itemKind: 'faq',
    itemTitlePh: 'Вопрос',
    itemDescPh: 'Ответ',
  },
  stats: {
    label: 'Цифры',
    hint: 'Только реальные цифры.',
    fields: ['title', 'description'],
    hasItems: true,
    itemKind: 'stat',
    itemTitlePh: 'Значение',
    itemDescPh: 'Подпись',
    itemMetaPh: 'people | game | home | star',
  },
  contact: {
    label: 'Контакты',
    hint: 'Без выдуманных адресов.',
    fields: ['title', 'description', 'telegramUrl', 'email', 'faqAnchor', 'imageUrl'],
  },
  footer: {
    label: 'Подвал',
    hint: 'Логотип-текст и legalText.',
    fields: ['title', 'description', 'legalText'],
  },
  quote: { label: 'Крупная цитата', fields: ['description', 'author'] },
  media: { label: 'Картинка', fields: ['title', 'description', 'imageUrl'] },
};

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultBlock(type) {
  const id = uid();
  if (type === 'hero') {
    return {
      id, type,
      title: 'Настоящие люди. Реальные приключения.',
      description: 'Находи единомышленников, собирайся на игры и создавай свои истории вместе с Adventura.',
      ctaLabel: 'Найти игру', ctaUrl: '/games',
      secondaryCtaLabel: 'Стать мастером', secondaryCtaUrl: '/register',
      imagePosition: 'right', trustText: 'Сообщество мастеров и игроков Adventura',
    };
  }
  if (type === 'features') {
    return {
      id, type, title: 'Почему выбирают Adventura', description: 'Всё для живых игр — в одном месте.', columns: 4,
      items: [
        { id: uid(), title: 'Найди свою партию', description: 'Открытые наборы рядом и онлайн.', meta: 'people' },
        { id: uid(), title: 'Собери команду', description: 'Создай игру и набери игроков.', meta: 'dice' },
        { id: uid(), title: 'Общайся', description: 'Чаты с мастером и партией.', meta: 'chat' },
        { id: uid(), title: 'Открывай миры', description: 'Клубы, системы и новые знакомства.', meta: 'planet' },
      ],
    };
  }
  if (type === 'appShowcase') {
    return { id, type, title: 'Всё, что ты любишь — в одном месте', description: 'Игры, клубы, анкеты и чаты.', ctaLabel: 'Открыть каталог', ctaUrl: '/games', imageSide: 'right' };
  }
  if (type === 'steps') {
    return {
      id, type, title: 'Начни своё приключение',
      items: [
        { id: uid(), title: 'Создай профиль', description: 'Расскажи, во что любишь играть.', meta: 'person' },
        { id: uid(), title: 'Найди игру', description: 'Фильтры по городу и формату.', meta: 'search' },
        { id: uid(), title: 'Присоединяйся', description: 'Отправь заявку мастеру.', meta: 'hand' },
        { id: uid(), title: 'Играй и общайся', description: 'Собирайтесь и продолжайте в чате.', meta: 'game' },
      ],
    };
  }
  if (type === 'gameFeed') return { id, type, title: 'Популярные игры рядом с тобой', limit: 4, ctaLabel: 'Смотреть все', ctaUrl: '/games' };
  if (type === 'testimonials') return { id, type, title: 'Что говорят наши пользователи', items: [{ id: uid(), title: 'Игрок', description: 'Добавьте реальный отзыв.', meta: 'Игрок' }] };
  if (type === 'clubFeed') return { id, type, title: 'Найди клуб рядом с собой', limit: 4, ctaLabel: 'Смотреть все', ctaUrl: '/clubs' };
  if (type === 'cta') return { id, type, title: 'Готов к новым приключениям?', description: 'Присоединяйся к Adventura.', ctaLabel: 'Начать приключение', ctaUrl: '/register' };
  if (type === 'faq') {
    return {
      id, type, title: 'Частые вопросы',
      items: [
        { id: uid(), title: 'Adventura бесплатна?', description: 'Регистрация и поиск бесплатны.' },
        { id: uid(), title: 'Можно ли создать свою игру?', description: 'Да — опубликуй набор и принимай заявки.' },
      ],
    };
  }
  if (type === 'stats') {
    return {
      id, type, title: 'Adventura в цифрах', source: 'manual',
      items: [
        { id: uid(), title: '—', description: 'укажите реальную цифру', meta: 'people' },
        { id: uid(), title: '—', description: 'игр', meta: 'game' },
      ],
    };
  }
  if (type === 'contact') return { id, type, title: 'Остались вопросы?', description: 'Укажите реальные контакты.', telegramUrl: '', email: '' };
  if (type === 'footer') {
    return {
      id, type, title: 'Adventura', description: 'Больше чем игры. Настоящие люди.', legalText: '© Adventura',
      groups: [{ id: uid(), title: 'Продукт', links: [{ label: 'Игры', url: '/games' }, { label: 'Клубы', url: '/clubs' }] }],
    };
  }
  return { id, type, title: '', description: '' };
}

const blockTypeOptions = Object.entries(BLOCK_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

const modeOptions = [
  { value: 'dark', label: 'Fantasy dark (референс)' },
  { value: 'light', label: 'Светлая (как приложение)' },
];
const skinOptions = [
  { value: 'fantasy', label: 'Fantasy (#0B111B)' },
  { value: 'app', label: 'Как UI приложения' },
];

const backgroundOptions = [
  { value: 'solid', label: 'Белый / чёрный фон' },
  { value: 'muted', label: 'Приглушённый серый' },
  { value: 'soft-blue', label: 'Мягкий синий Adventura' },
  { value: 'image', label: 'Картинка на весь экран' },
];

const accentOptions = [
  { value: 'adventura', label: 'Синий Adventura (#157AFE)' },
  { value: 'indigo', label: 'Индиго (#5856D6)' },
  { value: 'teal', label: 'Бирюза (#30B0C7)' },
];

function pickOption(options, value) {
  return options.find((o) => o.value === value) ?? options[0] ?? null;
}

function FieldHint({ children }) {
  return (
    <Text mt="sm" color="grey60" style={{ fontSize: 12, lineHeight: 1.4 }}>
      {children}
    </Text>
  );
}

export default function MarketingLandingsAdmin() {
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('desktop');
  const [showSeo, setShowSeo] = useState(false);

  const draft = useMemo(() => {
    if (!current) return empty;
    const content = current.draftContent ?? { blocks: [] };
    return {
      ...current,
      draftContent: {
        ...content,
        blocks: Array.isArray(content.blocks) ? content.blocks : [],
        theme: normalizeTheme(content.theme),
      },
    };
  }, [current]);

  const theme = draft.draftContent.theme;
  const blocks = draft.draftContent?.blocks ?? [];
  const seo = draft.draftSeo ?? {};

  const load = useCallback(async () => {
    const r = await api.getPage({ pageName: PAGE_NAME });
    const p = r.data ?? r;
    setItems(p.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (key, value) => setCurrent({ ...draft, [key]: value });
  const mutateContent = (patch) =>
    update('draftContent', { ...draft.draftContent, ...patch });
  const mutateBlocks = (next) => mutateContent({ blocks: next });
  const patchTheme = (patch) =>
    mutateContent({ theme: normalizeTheme({ ...theme, ...patch }) });
  const patchBlock = (index, patch) =>
    mutateBlocks(blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)));
  const patchBlockItem = (blockIndex, itemIndex, patch) => {
    const block = blocks[blockIndex];
    const items = Array.isArray(block?.items) ? [...block.items] : [];
    items[itemIndex] = { ...items[itemIndex], ...patch };
    patchBlock(blockIndex, { items });
  };
  const addBlockItem = (blockIndex) => {
    const block = blocks[blockIndex];
    const items = Array.isArray(block?.items) ? [...block.items] : [];
    items.push({ id: crypto.randomUUID(), title: '', description: '', meta: '' });
    patchBlock(blockIndex, { items });
  };
  const removeBlockItem = (blockIndex, itemIndex) => {
    const block = blocks[blockIndex];
    const items = (Array.isArray(block?.items) ? block.items : []).filter((_, n) => n !== itemIndex);
    patchBlock(blockIndex, { items });
  };
  const moveBlock = (index, direction) => {
    const next = [...blocks];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    mutateBlocks(next);
  };

  const send = async (action, extra) => {
    setBusy(true);
    try {
      const data = new FormData();
      data.append('action', action);
      if (draft.id) data.append('id', draft.id);
      ['name', 'slug', 'description'].forEach((k) => data.append(k, draft[k] ?? ''));
      data.append(
        'content',
        JSON.stringify({
          ...draft.draftContent,
          theme: normalizeTheme(draft.draftContent?.theme),
        }),
      );
      data.append('seo', JSON.stringify(draft.draftSeo ?? {}));
      Object.entries(extra ?? {}).forEach(([k, v]) => data.append(k, v));
      const r = await api.getPage({ pageName: PAGE_NAME, method: 'post', data });
      const p = r.data ?? r;
      setItems(p.items ?? []);
      setNotice(p.notice);
      if (action === 'create') setCurrent(empty);
      else if (p.items && draft.id) {
        const refreshed = p.items.find((item) => item.id === draft.id);
        if (refreshed) setCurrent(refreshed);
      }
      return p;
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file, onUploaded) => {
    if (!draft.id) {
      setNotice({ type: 'error', message: 'Сначала сохраните лендинг' });
      return;
    }
    if (!file) return;
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
      });
      const result = await send('uploadImage', {
        fileBase64: base64,
        fileMime: file.type || 'image/jpeg',
        fileName: file.name || 'image.jpg',
      });
      if (result?.uploaded?.url) onUploaded?.(result.uploaded.url);
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Не удалось загрузить изображение',
      });
    }
  };

  const ImageUploadField = ({ label = 'Изображение', value, onChange, hint }) => (
    <Box>
      <Label>{label}</Label>
      {value ? (
        <Box mt="sm" p="sm" variant="grey10" style={{ borderRadius: 8 }}>
          <img
            src={value}
            alt="Предпросмотр загруженного изображения"
            style={{ display: 'block', width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 6 }}
          />
          <Text mt="sm" color="grey60" style={{ fontSize: 12 }}>Изображение выбрано</Text>
        </Box>
      ) : null}
      {draft.id ? (
        <Box mt="sm">
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            width={1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void uploadImage(file, onChange);
            }}
          />
          <FieldHint>{hint || 'Файл будет обработан и сохранён в S3-хранилище.'}</FieldHint>
          {value ? (
            <Button size="sm" mt="sm" type="button" variant="danger" onClick={() => onChange('')}>
              Удалить изображение из блока
            </Button>
          ) : null}
        </Box>
      ) : (
        <FieldHint>Сначала сохрани лендинг, затем здесь появится загрузка в S3.</FieldHint>
      )}
    </Box>
  );

  const previewHtml = useMemo(
    () => buildPreviewHtml(draft.draftContent, { mobile: preview === 'mobile' }),
    [draft.draftContent, preview],
  );

  const checklist = [
    { ok: Boolean(draft.name?.trim()), text: 'Название' },
    { ok: Boolean(draft.slug?.trim()), text: 'Slug в URL (/l/…)' },
    { ok: blocks.some((b) => b.type === 'hero'), text: 'Есть главный экран' },
    { ok: blocks.some((b) => b.ctaLabel || b.type === 'cta'), text: 'Есть кнопка действия' },
    { ok: draft.status === 'PUBLISHED', text: 'Опубликован (виден по ссылке)' },
  ];

  return (
    <Box variant="grey20" padding="xxl">
      <Header.H2>Маркетинг · Лендинги</Header.H2>
      <Text color="grey60" mt="sm" style={{ maxWidth: 720, lineHeight: 1.5 }}>
        Страница по адресу <code>/l/ваш-slug</code>. Черновик правишь здесь → «Сохранить» → «Опубликовать».
        Кампании потом клеят к этой странице UTM-ссылки.
      </Text>
      {notice && (
        <MessageBox mt="lg" message={notice.message} variant={notice.type === 'error' ? 'danger' : 'success'} />
      )}

      <Box display="grid" style={{ gridTemplateColumns: '240px minmax(0, 1fr)', gap: 24, maxWidth: 1480 }} mt="xl">
        <Box>
          <Button width={1} variant="primary" onClick={() => setCurrent({ ...empty, draftContent: { blocks: [], theme: { ...defaultTheme } } })}>
            + Новый лендинг
          </Button>
          {items.map((item) => (
            <Box
              key={item.id}
              variant="white"
              p="md"
              mt="sm"
              onClick={() => setCurrent(item)}
              style={{
                cursor: 'pointer',
                borderRadius: 10,
                border: current?.id === item.id ? '2px solid #157AFE' : '1px solid #E4E7EC',
              }}>
              <Text fontWeight="bold">{item.name}</Text>
              <Text color="grey60">
                /l/{item.slug} · {item.status === 'PUBLISHED' ? 'опубликован' : item.status === 'DRAFT' ? 'черновик' : item.status}
              </Text>
            </Box>
          ))}
        </Box>

        <Box variant="white" p="xl" style={{ borderRadius: 14, minWidth: 0 }}>
          {!current && (
            <Text color="grey60">Выбери лендинг слева или создай новый.</Text>
          )}

          {current && (
            <Box display="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, 0.95fr)', gap: 28 }}>
              <Box>
                <Header.H4>Основное</Header.H4>
                <Label mt="md">Название (для админки)</Label>
                <Input width={1} value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="Напр. Запуск в Telegram" />
                <Label mt="md">Slug — хвост URL</Label>
                <Input width={1} value={draft.slug} onChange={(e) => update('slug', e.target.value)} placeholder="telegram-launch" />
                <FieldHint>
                  Публичный адрес: <strong>/l/{draft.slug || '…'}</strong>. Только латиница, цифры, дефис.
                </FieldHint>
                <Label mt="md">Внутреннее описание</Label>
                <TextArea
                  width={1}
                  value={draft.description ?? ''}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder="Не показывается на сайте — заметка для команды"
                />

                <Box mt="xl" p="lg" variant="grey10" style={{ borderRadius: 12 }}>
                  <Header.H4>Чеклист</Header.H4>
                  {checklist.map((row) => (
                    <Text key={row.text} mt="sm" color={row.ok ? 'success' : 'grey60'}>
                      {row.ok ? '✓' : '○'} {row.text}
                    </Text>
                  ))}
                </Box>

                <Header.H4 mt="xl">Внешний вид</Header.H4>
                <FieldHint>Fantasy dark по референсу. Скин «как приложение» — светлая/тёмная палитра UI.</FieldHint>
                <Label mt="md">Тема</Label>
                <Select
                  width={1}
                  options={modeOptions}
                  value={pickOption(modeOptions, theme.mode)}
                  onChange={(v) => patchTheme({ mode: v?.value || 'dark' })}
                />
                <Label mt="md">Скин</Label>
                <Select
                  width={1}
                  options={skinOptions}
                  value={pickOption(skinOptions, theme.skin || 'fantasy')}
                  onChange={(v) => patchTheme({ skin: v?.value || 'fantasy' })}
                />
                <Label mt="md">Фон страницы</Label>
                <Select
                  width={1}
                  options={backgroundOptions}
                  value={pickOption(backgroundOptions, theme.background)}
                  onChange={(v) => patchTheme({ background: v?.value || 'solid' })}
                />
                <Label mt="md">Цвет кнопок</Label>
                <Select
                  width={1}
                  options={accentOptions}
                  value={pickOption(accentOptions, theme.accent)}
                  onChange={(v) => patchTheme({ accent: v?.value || 'adventura' })}
                />
                {theme.background === 'image' ? (
                  <Box mt="md">
                    <ImageUploadField
                      label="Фоновое изображение"
                      value={theme.backgroundImageUrl}
                      onChange={(backgroundImageUrl) => patchTheme({ backgroundImageUrl })}
                      hint="Фон будет закреплён под контентом лендинга. Файл хранится в S3."
                    />
                  </Box>
                ) : null}

                <Box mt="xl">
                  <Button size="sm" onClick={() => setShowSeo((v) => !v)}>
                    {showSeo ? '▾' : '▸'} SEO (для Google / соцсетей)
                  </Button>
                  {showSeo ? (
                    <Box mt="md">
                      <FieldHint>
                        Title/Description — вкладка браузера и сниппет. OG image — картинка при шаринге в Telegram/VK.
                        Canonical — канонический URL (обычно оставь пустым). Robots — <code>index,follow</code> = индексировать.
                      </FieldHint>
                      <Label mt="md">Title</Label>
                      <Input width={1} value={seo.title ?? ''} onChange={(e) => update('draftSeo', { ...seo, title: e.target.value })} placeholder="Заголовок вкладки" />
                      <Label mt="md">Description</Label>
                      <TextArea width={1} value={seo.description ?? ''} onChange={(e) => update('draftSeo', { ...seo, description: e.target.value })} placeholder="1–2 предложения для сниппета" />
                      <Box mt="md">
                        <ImageUploadField
                          label="OG image"
                          value={seo.image}
                          onChange={(image) => update('draftSeo', { ...seo, image })}
                        />
                      </Box>
                      <Label mt="md">Canonical</Label>
                      <Input width={1} value={seo.canonical ?? ''} onChange={(e) => update('draftSeo', { ...seo, canonical: e.target.value })} />
                      <Label mt="md">Robots</Label>
                      <Input width={1} value={seo.robots ?? 'index,follow'} onChange={(e) => update('draftSeo', { ...seo, robots: e.target.value })} />
                    </Box>
                  ) : null}
                </Box>

                <Header.H4 mt="xl">Блоки страницы</Header.H4>
                <FieldHint>
                  Порядок сверху вниз = на сайте. У «Преимуществ / Шагов / Отзывов / Вопросов / Цифр» обязательно добавь пункты — иначе блок пустой.
                </FieldHint>
                <Select
                  options={blockTypeOptions}
                  value={null}
                  onChange={(v) => {
                    if (v?.value) {
                      mutateBlocks([...blocks, createDefaultBlock(v.value)]);
                    }
                  }}
                  placeholder="Добавить блок…"
                />

                {blocks.map((block, i) => {
                  const meta = BLOCK_META[block.type] || {
                    label: block.type,
                    hint: '',
                    fields: ['title', 'description'],
                  };
                  const fields = meta.fields || [];
                  const blockItems = Array.isArray(block.items) ? block.items : [];
                  return (
                    <Box key={block.id ?? i} p="md" mt="md" variant="grey10" style={{ borderRadius: 10 }}>
                      <Text fontWeight="bold">
                        {i + 1}. {meta.label}
                      </Text>
                      <FieldHint>{meta.hint}</FieldHint>
                      <Box mt="sm" style={{ display: 'grid', gap: 10 }}>
                        {fields.includes('title') ? (
                          <Input
                            width={1}
                            value={block.title ?? ''}
                            placeholder={meta.titlePh || 'Заголовок блока'}
                            onChange={(e) => patchBlock(i, { title: e.target.value })}
                          />
                        ) : null}
                        {fields.includes('description') ? (
                          <TextArea
                            width={1}
                            value={block.description ?? ''}
                            placeholder={meta.descPh || 'Текст под заголовком'}
                            onChange={(e) => patchBlock(i, { description: e.target.value })}
                          />
                        ) : null}
                        {fields.includes('author') ? (
                          <Input
                            width={1}
                            value={block.author ?? ''}
                            placeholder={meta.authorPh || 'Автор'}
                            onChange={(e) => patchBlock(i, { author: e.target.value })}
                          />
                        ) : null}
                        {fields.includes('eyebrow') ? (
                          <Input width={1} value={block.eyebrow ?? ''} placeholder="Надзаголовок" onChange={(e) => patchBlock(i, { eyebrow: e.target.value })} />
                        ) : null}
                        {fields.includes('ctaLabel') ? (
                          <Input width={1} value={block.ctaLabel ?? ''} placeholder="Текст основной кнопки" onChange={(e) => patchBlock(i, { ctaLabel: e.target.value })} />
                        ) : null}
                        {fields.includes('ctaUrl') ? (
                          <Input width={1} value={block.ctaUrl ?? ''} placeholder="URL основной кнопки" onChange={(e) => patchBlock(i, { ctaUrl: e.target.value })} />
                        ) : null}
                        {fields.includes('secondaryCtaLabel') ? (
                          <Input width={1} value={block.secondaryCtaLabel ?? ''} placeholder="Текст второй кнопки" onChange={(e) => patchBlock(i, { secondaryCtaLabel: e.target.value })} />
                        ) : null}
                        {fields.includes('secondaryCtaUrl') ? (
                          <Input width={1} value={block.secondaryCtaUrl ?? ''} placeholder="URL второй кнопки" onChange={(e) => patchBlock(i, { secondaryCtaUrl: e.target.value })} />
                        ) : null}
                        {fields.includes('trustText') ? (
                          <Input width={1} value={block.trustText ?? ''} placeholder="Строка доверия" onChange={(e) => patchBlock(i, { trustText: e.target.value })} />
                        ) : null}
                        {fields.includes('imagePosition') ? (
                          <Input width={1} value={block.imagePosition ?? ''} placeholder="right | background | center" onChange={(e) => patchBlock(i, { imagePosition: e.target.value })} />
                        ) : null}
                        {fields.includes('imageSide') ? (
                          <Input width={1} value={block.imageSide ?? ''} placeholder="left | right" onChange={(e) => patchBlock(i, { imageSide: e.target.value })} />
                        ) : null}
                        {fields.includes('imageUrl') ? (
                          <ImageUploadField
                            label="Изображение"
                            value={block.imageUrl}
                            onChange={(imageUrl) => patchBlock(i, { imageUrl })}
                          />
                        ) : null}
                        {fields.includes('imageUrlSecondary') ? (
                          <ImageUploadField
                            label="Второе изображение"
                            value={block.imageUrlSecondary}
                            onChange={(imageUrlSecondary) => patchBlock(i, { imageUrlSecondary })}
                          />
                        ) : null}
                        {fields.includes('telegramUrl') ? (
                          <Input width={1} value={block.telegramUrl ?? ''} placeholder="https://t.me/…" onChange={(e) => patchBlock(i, { telegramUrl: e.target.value })} />
                        ) : null}
                        {fields.includes('email') ? (
                          <Input width={1} value={block.email ?? ''} placeholder="email" onChange={(e) => patchBlock(i, { email: e.target.value })} />
                        ) : null}
                        {fields.includes('faqAnchor') ? (
                          <Input width={1} value={block.faqAnchor ?? ''} placeholder="Ссылка на FAQ" onChange={(e) => patchBlock(i, { faqAnchor: e.target.value })} />
                        ) : null}
                        {fields.includes('legalText') ? (
                          <Input width={1} value={block.legalText ?? ''} placeholder="© Adventura" onChange={(e) => patchBlock(i, { legalText: e.target.value })} />
                        ) : null}
                        {fields.includes('limit') ? (
                          <Input width={1} value={block.limit ?? ''} placeholder="Лимит карточек" onChange={(e) => patchBlock(i, { limit: Number(e.target.value) || 6 })} />
                        ) : null}
                      </Box>

                      {meta.hasItems ? (
                        <Box mt="lg">
                          <Text fontWeight="bold">
                            {meta.itemKind === 'faq'
                              ? 'Вопросы'
                              : meta.itemKind === 'step'
                                ? 'Шаги'
                                : meta.itemKind === 'testimonial'
                                  ? 'Отзывы'
                                  : meta.itemKind === 'stat'
                                    ? 'Цифры'
                                    : 'Пункты'}
                          </Text>
                          {blockItems.map((item, itemIndex) => (
                            <Box
                              key={item.id ?? itemIndex}
                              mt="sm"
                              p="md"
                              variant="white"
                              style={{ borderRadius: 8, border: '1px solid #E4E7EC' }}>
                              <Text color="grey60" style={{ fontSize: 12 }}>
                                #{itemIndex + 1}
                              </Text>
                              <Box mt="sm" style={{ display: 'grid', gap: 8 }}>
                                <Input
                                  width={1}
                                  value={item.title ?? ''}
                                  placeholder={meta.itemTitlePh || 'Заголовок'}
                                  onChange={(e) => patchBlockItem(i, itemIndex, { title: e.target.value })}
                                />
                                <TextArea
                                  width={1}
                                  value={item.description ?? ''}
                                  placeholder={meta.itemDescPh || 'Текст'}
                                  onChange={(e) =>
                                    patchBlockItem(i, itemIndex, { description: e.target.value })
                                  }
                                />
                                {meta.itemMetaPh ? (
                                  <Input
                                    width={1}
                                    value={item.meta ?? ''}
                                    placeholder={meta.itemMetaPh}
                                    onChange={(e) => patchBlockItem(i, itemIndex, { meta: e.target.value })}
                                  />
                                ) : null}
                                {meta.itemMetaLabel && meta.itemMetaPh ? (
                                  <FieldHint>{meta.itemMetaLabel}</FieldHint>
                                ) : null}
                                {meta.itemKind === 'testimonial' ? (
                                  <ImageUploadField
                                    label="Аватар автора"
                                    value={item.imageUrl}
                                    onChange={(imageUrl) => patchBlockItem(i, itemIndex, { imageUrl })}
                                    hint="Необязательное поле. Без аватара будет показана буква имени."
                                  />
                                ) : null}
                              </Box>
                              <Button
                                size="sm"
                                mt="sm"
                                variant="danger"
                                onClick={() => removeBlockItem(i, itemIndex)}>
                                Удалить пункт
                              </Button>
                            </Box>
                          ))}
                          <Button size="sm" mt="sm" onClick={() => addBlockItem(i)}>
                            + Добавить пункт
                          </Button>
                        </Box>
                      ) : null}

                      <Box mt="sm" display="flex" style={{ gap: 8 }}>
                        <Button size="sm" onClick={() => moveBlock(i, -1)}>
                          ↑
                        </Button>
                        <Button size="sm" onClick={() => moveBlock(i, 1)}>
                          ↓
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => mutateBlocks(blocks.filter((_, n) => n !== i))}>
                          Удалить блок
                        </Button>
                      </Box>
                    </Box>
                  );
                })}

                <Box mt="xl" display="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="primary" disabled={busy} onClick={() => send(draft.id ? 'save' : 'create')}>
                    Сохранить черновик
                  </Button>
                  {draft.id ? (
                    <>
                      <Button disabled={busy} onClick={() => send('publish')}>
                        Опубликовать
                      </Button>
                      <Button variant="danger" disabled={busy} onClick={() => send('archive')}>
                        В архив
                      </Button>
                    </>
                  ) : null}
                </Box>
              </Box>

              <Box>
                <Header.H4>Как увидит пользователь</Header.H4>
                <FieldHint>
                  Превью повторяет публичную вёрстку: шаги с номерами, отзывы с кавычками, FAQ как «В/О», цифры крупно.
                </FieldHint>
                <Box mt="md" display="flex" style={{ gap: 8 }}>
                  <Button size="sm" variant={preview === 'desktop' ? 'primary' : 'text'} onClick={() => setPreview('desktop')}>
                    Desktop
                  </Button>
                  <Button size="sm" variant={preview === 'mobile' ? 'primary' : 'text'} onClick={() => setPreview('mobile')}>
                    Mobile
                  </Button>
                </Box>
                <Box
                  mt="md"
                  style={{
                    maxWidth: preview === 'mobile' ? 410 : '100%',
                    margin: '0 auto',
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: '1px solid #E4E7EC',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
                  }}>
                  <iframe
                    title="landing-preview"
                    srcDoc={previewHtml}
                    style={{
                      display: 'block',
                      width: '100%',
                      height: preview === 'mobile' ? 760 : 680,
                      border: 0,
                      background: '#fff',
                    }}
                  />
                </Box>
                {blocks.length === 0 ? (
                  <MessageBox mt="md" variant="info" message="Добавь хотя бы «Главный экран» — иначе страница пустая." />
                ) : null}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

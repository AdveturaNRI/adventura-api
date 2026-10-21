import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from 'adminjs';
import {
  Box,
  Button,
  CheckBox,
  Header,
  Input,
  Label,
  MessageBox,
  Select,
  Text,
  TextArea,
} from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'siteAnnouncements';

const DEFAULT_THEME = {
  themeMode: 'light',
  backgroundColor: '#FFFFFF',
  titleColor: '#111827',
  bodyColor: '#374151',
  buttonColor: '#157AFE',
  accentColor: '#157AFE',
  imageLayout: 'top',
  imageAspect: '16:9',
  imageFocusX: 50,
  imageFocusY: 50,
  modalWidth: 480,
  borderRadius: 20,
  buttonStyle: 'filled',
  showImage: true,
  showActionButton: true,
  animationEnabled: true,
};

const aspectRatio = {
  '16:9': '16 / 9',
  '4:3': '4 / 3',
  '1:1': '1 / 1',
  auto: 'auto',
};

function clampFocus(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Drag inside the crop frame to choose which part of the image stays visible. */
function ImageFocusPad({ url, aspect, focusX, focusY, onChange }) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);

  const position = `${clampFocus(focusX)}% ${clampFocus(focusY)}%`;

  const onPointerDown = (event) => {
    if (!frameRef.current) return;
    frameRef.current.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event) => {
    if (!dragRef.current || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    // Drag image right → show left side (decrease focus X)
    onChange(
      clampFocus(focusX - (dx / rect.width) * 100),
      clampFocus(focusY - (dy / rect.height) * 100),
    );
  };

  const onPointerUp = (event) => {
    dragRef.current = null;
    frameRef.current?.releasePointerCapture?.(event.pointerId);
  };

  return (
    <Box marginTop="sm" marginBottom="sm">
      <Text color="grey60" fontSize={12} marginBottom="sm">
        Перетащи картинку мышью, чтобы выбрать видимую область. Сохрани
        объявление после настройки.
      </Text>
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="presentation"
        style={{
          width: '100%',
          maxWidth: 420,
          aspectRatio: aspectRatio[aspect] || '16 / 9',
          backgroundColor: '#e5e7eb',
          backgroundImage: `url(${url})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: position,
          borderRadius: 10,
          border: '1px solid #d1d5db',
          cursor: 'grab',
          touchAction: 'none',
          userSelect: 'none',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${clampFocus(focusX)}%`,
            top: `${clampFocus(focusY)}%`,
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            borderRadius: 8,
            border: '2px solid #fff',
            background: '#157AFE',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <Box flex marginTop="sm" style={{ gap: 12, flexWrap: 'wrap' }}>
        <Box style={{ flex: '1 1 140px' }}>
          <Label>По горизонтали ({clampFocus(focusX)}%)</Label>
          <Input
            type="range"
            min={0}
            max={100}
            value={clampFocus(focusX)}
            onChange={(e) => onChange(Number(e.target.value), focusY)}
          />
        </Box>
        <Box style={{ flex: '1 1 140px' }}>
          <Label>По вертикали ({clampFocus(focusY)}%)</Label>
          <Input
            type="range"
            min={0}
            max={100}
            value={clampFocus(focusY)}
            onChange={(e) => onChange(focusX, Number(e.target.value))}
          />
        </Box>
        <Button
          size="sm"
          onClick={() => onChange(50, 50)}
        >
          По центру
        </Button>
      </Box>
    </Box>
  );
}

const emptyForm = {
  id: '',
  internalName: '',
  title: '',
  body: '',
  actionLabel: '',
  actionUrl: '',
  publishedAt: '',
  status: 'DRAFT',
  publicationVersion: 0,
  imageUrl: null,
  theme: { ...DEFAULT_THEME },
};

const statusLabel = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликовано',
  ARCHIVED: 'Архив',
};

function Preview({ form }) {
  const theme = form.theme || DEFAULT_THEME;
  const isDark = theme.themeMode === 'dark';
  const bg = theme.backgroundColor || (isDark ? '#111827' : '#FFFFFF');
  const titleColor = theme.titleColor || (isDark ? '#F9FAFB' : '#111827');
  const bodyColor = theme.bodyColor || (isDark ? '#D1D5DB' : '#374151');
  const buttonColor = theme.buttonColor || '#157AFE';
  const side = theme.imageLayout === 'side';
  const showImage = theme.showImage !== false && form.imageUrl;
  const showAction =
    theme.showActionButton !== false && form.actionLabel && form.actionUrl;

  return (
    <Box
      style={{
        background: 'rgba(15,23,42,0.45)',
        borderRadius: 12,
        padding: 16,
        minHeight: 280,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: Math.min(Number(theme.modalWidth) || 480, 560),
          background: bg,
          borderRadius: Number(theme.borderRadius) || 20,
          overflow: 'hidden',
          boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
          position: 'relative',
          display: 'flex',
          flexDirection: side && showImage ? 'row' : 'column',
        }}
      >
        <button
          type="button"
          aria-label="Закрыть"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 2,
            width: 36,
            height: 36,
            borderRadius: 18,
            border: 'none',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            fontSize: 22,
            lineHeight: '36px',
            cursor: 'default',
          }}
        >
          ×
        </button>
        {showImage ? (
          <div
            style={{
              flex: side ? '0 0 42%' : undefined,
              width: side ? '42%' : '100%',
              aspectRatio: side ? undefined : aspectRatio[theme.imageAspect] || '16 / 9',
              minHeight: side ? 160 : undefined,
              backgroundImage: `url(${form.imageUrl})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'cover',
              backgroundPosition: `${clampFocus(theme.imageFocusX)}% ${clampFocus(theme.imageFocusY)}%`,
              backgroundColor: '#e5e7eb',
            }}
          />
        ) : null}
        <div style={{ padding: 20, flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 20,
              color: titleColor,
              marginBottom: 8,
              paddingRight: 28,
            }}
            dangerouslySetInnerHTML={{
              __html: form.title || 'Заголовок объявления',
            }}
          />
          <div
            style={{
              color: bodyColor,
              fontSize: 14,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              marginBottom: showAction ? 16 : 0,
            }}
            dangerouslySetInnerHTML={{
              __html: form.body || 'Текст объявления',
            }}
          />
          {showAction ? (
            <button
              type="button"
              style={{
                borderRadius: 999,
                padding: '10px 18px',
                border:
                  theme.buttonStyle === 'outline'
                    ? `2px solid ${buttonColor}`
                    : 'none',
                background:
                  theme.buttonStyle === 'outline' ? 'transparent' : buttonColor,
                color: theme.buttonStyle === 'outline' ? buttonColor : '#fff',
                fontWeight: 600,
                cursor: 'default',
              }}
            >
              {form.actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </Box>
  );
}

function SiteAnnouncementsAdmin() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getPage({ pageName: PAGE_NAME });
      const payload = response.data ?? response;
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setThemeField = (key, value) => {
    setForm((prev) => ({
      ...prev,
      theme: { ...DEFAULT_THEME, ...prev.theme, [key]: value },
    }));
  };

  const selectItem = (item) => {
    setForm({
      id: item.id,
      internalName: item.internalName || '',
      title: item.title || '',
      body: item.body || '',
      actionLabel: item.actionLabel || '',
      actionUrl: item.actionUrl || '',
      publishedAt: item.publishedAt
        ? String(item.publishedAt).slice(0, 16)
        : '',
      status: item.status || 'DRAFT',
      publicationVersion: item.publicationVersion || 0,
      imageUrl: item.imageUrl || null,
      theme: { ...DEFAULT_THEME, ...(item.theme || {}) },
    });
    setNotice(null);
    setError(null);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setNotice(null);
    setError(null);
  };

  const sendPageAction = async (action, sourceForm, extra = {}) => {
    const data = new FormData();
    data.append('action', action);
    if (sourceForm.id) data.append('id', sourceForm.id);
    data.append('internalName', sourceForm.internalName);
    data.append('title', sourceForm.title);
    data.append('body', sourceForm.body);
    data.append('actionLabel', sourceForm.actionLabel);
    data.append('actionUrl', sourceForm.actionUrl);
    if (sourceForm.publishedAt) {
      data.append('publishedAt', sourceForm.publishedAt);
    }
    data.append('theme', JSON.stringify(sourceForm.theme || DEFAULT_THEME));
    Object.entries(extra).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      data.append(key, String(value));
    });

    const response = await api.getPage({
      pageName: PAGE_NAME,
      method: 'post',
      data,
    });
    const payload = response.data ?? response;
    if (payload.notice?.type === 'error' || payload.error) {
      throw new Error(
        String(payload.notice?.message || payload.error || 'Ошибка'),
      );
    }
    return payload;
  };

  const postAction = async (action, extra = {}) => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const payload = await sendPageAction(action, form, extra);
      setItems(Array.isArray(payload.items) ? payload.items : []);
      if (payload.item) {
        selectItem(payload.item);
      } else if (action === 'delete') {
        resetForm();
      }
      setNotice(payload.notice?.message || 'Готово');
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file) => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      let announcementId = form.id;

      if (!announcementId) {
        if (!form.internalName.trim() || !form.title.trim()) {
          throw new Error(
            'Перед загрузкой картинки укажите внутреннее название и заголовок — сохраним черновик автоматически',
          );
        }
        const created = await sendPageAction('create', form);
        if (!created?.item?.id) {
          throw new Error('Не удалось создать черновик для загрузки картинки');
        }
        announcementId = created.item.id;
        selectItem(created.item);
        setItems(Array.isArray(created.items) ? created.items : []);
      }

      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
      });
      const data = new FormData();
      data.append('action', 'uploadImage');
      data.append('id', announcementId);
      data.append('fileBase64', base64);
      data.append('fileMime', file.type || 'image/jpeg');
      data.append('fileName', file.name || 'image.jpg');
      const response = await api.getPage({
        pageName: PAGE_NAME,
        method: 'post',
        data,
      });
      const payload = response.data ?? response;
      if (payload.notice?.type === 'error') {
        throw new Error(String(payload.notice.message));
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
      if (payload.item) selectItem(payload.item);
      setNotice('Картинка загружена');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
    }
  };

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
      ),
    [items],
  );

  return (
    <Box variant="grey100" padding="xl">
      <Header.H2>Новостные объявления</Header.H2>
      <Text marginBottom="lg" color="grey60">
        Глобальные модалки для авторизованных пользователей. Черновик никто не
        видит. «Опубликовать повторно» поднимает версию — окно снова покажется
        тем, кто уже закрывал прошлую версию.
      </Text>

      {notice ? (
        <MessageBox message={notice} variant="info" marginBottom="default" />
      ) : null}
      {error ? (
        <MessageBox message={error} variant="danger" marginBottom="default" />
      ) : null}

      <Box marginBottom="xl" style={{ maxWidth: 560 }}>
        <Header.H3>Предпросмотр</Header.H3>
        <Preview form={form} />
      </Box>

      <Box flex style={{ gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box
          flex
          style={{
            flex: '0 1 300px',
            minWidth: 260,
            maxWidth: 340,
            flexDirection: 'column',
            gap: 12,
            maxHeight: 'calc(100vh - 160px)',
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          <Box
            flex
            style={{
              justifyContent: 'space-between',
              gap: 8,
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: 'var(--colorGrey20, #f5f5f5)',
              paddingBottom: 4,
            }}
          >
            <Header.H3>Список</Header.H3>
            <Button size="sm" onClick={resetForm} disabled={busy}>
              Новое
            </Button>
          </Box>
          {loading ? <Text>Загрузка…</Text> : null}
          {!loading && sortedItems.length === 0 ? (
            <Text color="grey60">Пока пусто — создайте первое объявление.</Text>
          ) : null}
          {sortedItems.map((item) => (
            <Box
              key={item.id}
              variant="white"
              padding="default"
              style={{
                border:
                  form.id === item.id
                    ? '2px solid #157AFE'
                    : '1px solid #e5e7eb',
                borderRadius: 10,
                cursor: 'pointer',
                flexShrink: 0,
              }}
              onClick={() => selectItem(item)}
            >
              <Text fontWeight="bold">{item.internalName}</Text>
              <Text color="grey60" fontSize={12}>
                {statusLabel[item.status] || item.status} · v
                {item.publicationVersion || 0}
                {' · '}
                {item.views ?? 0} просм. · {item.likesCount ?? 0} лайк.
              </Text>
              <Text marginTop="sm">{item.title}</Text>
            </Box>
          ))}
        </Box>

        <Box flex style={{ flex: '1 1 420px', minWidth: 320, flexDirection: 'column', gap: 12 }}>
          <Header.H3>{form.id ? 'Редактирование' : 'Создание'}</Header.H3>

          <Label>Внутреннее название</Label>
          <Input
            value={form.internalName}
            onChange={(e) => setField('internalName', e.target.value)}
            placeholder="Например: релиз 2.4"
          />

          <Label>Заголовок для пользователей</Label>
          <Input
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
          />

          <Label>Текст (можно простой HTML: p, strong, em, a, ul/ol)</Label>
          <TextArea
            value={form.body}
            onChange={(e) => setField('body', e.target.value)}
            rows={6}
          />

          <Label>Кнопка действия — текст</Label>
          <Input
            value={form.actionLabel}
            onChange={(e) => setField('actionLabel', e.target.value)}
            placeholder="Необязательно"
          />
          <Label>Кнопка действия — URL</Label>
          <Input
            value={form.actionUrl}
            onChange={(e) => setField('actionUrl', e.target.value)}
            placeholder="https://… или /path"
          />

          <Label>Дата публикации (если нужна отложенная)</Label>
          <Input
            type="datetime-local"
            value={form.publishedAt}
            onChange={(e) => setField('publishedAt', e.target.value)}
          />

          <Box marginTop="default">
            <Label>Изображение</Label>
            {form.imageUrl ? (
              <img
                src={form.imageUrl}
                alt=""
                style={{
                  width: '100%',
                  maxHeight: 180,
                  objectFit: 'cover',
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              />
            ) : (
              <Text color="grey60" marginBottom="sm">
                {form.id
                  ? 'Нет картинки'
                  : 'Можно выбрать файл сразу: черновик сохранится сам (нужны название и заголовок)'}
              </Text>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadImage(file);
                e.target.value = '';
              }}
            />
            {form.imageUrl ? (
              <ImageFocusPad
                url={form.imageUrl}
                aspect={form.theme.imageAspect || '16:9'}
                focusX={form.theme.imageFocusX ?? 50}
                focusY={form.theme.imageFocusY ?? 50}
                onChange={(x, y) => {
                  setForm((prev) => ({
                    ...prev,
                    theme: {
                      ...DEFAULT_THEME,
                      ...prev.theme,
                      imageFocusX: clampFocus(x),
                      imageFocusY: clampFocus(y),
                    },
                  }));
                }}
              />
            ) : null}
            {form.id && form.imageUrl ? (
              <Button
                size="sm"
                marginTop="sm"
                variant="danger"
                disabled={busy}
                onClick={() => void postAction('removeImage')}
              >
                Удалить изображение
              </Button>
            ) : null}
          </Box>

          <Header.H4 marginTop="xl">Оформление</Header.H4>
          <Box flex style={{ gap: 12, flexWrap: 'wrap' }}>
            <Box style={{ flex: '1 1 140px' }}>
              <Label>Тема</Label>
              <Select
                value={form.theme.themeMode}
                onChange={(selected) =>
                  setThemeField('themeMode', selected?.value || 'light')
                }
                options={[
                  { value: 'light', label: 'Светлая' },
                  { value: 'dark', label: 'Тёмная' },
                ]}
              />
            </Box>
            <Box style={{ flex: '1 1 140px' }}>
              <Label>Картинка</Label>
              <Select
                value={form.theme.imageLayout}
                onChange={(selected) =>
                  setThemeField('imageLayout', selected?.value || 'top')
                }
                options={[
                  { value: 'top', label: 'Сверху' },
                  { value: 'side', label: 'Сбоку' },
                ]}
              />
            </Box>
            <Box style={{ flex: '1 1 140px' }}>
              <Label>Соотношение</Label>
              <Select
                value={form.theme.imageAspect}
                onChange={(selected) =>
                  setThemeField('imageAspect', selected?.value || '16:9')
                }
                options={[
                  { value: '16:9', label: '16:9' },
                  { value: '4:3', label: '4:3' },
                  { value: '1:1', label: '1:1' },
                  { value: 'auto', label: 'Авто' },
                ]}
              />
            </Box>
            <Box style={{ flex: '1 1 140px' }}>
              <Label>Стиль кнопки</Label>
              <Select
                value={form.theme.buttonStyle}
                onChange={(selected) =>
                  setThemeField('buttonStyle', selected?.value || 'filled')
                }
                options={[
                  { value: 'filled', label: 'Заливка' },
                  { value: 'outline', label: 'Контур' },
                ]}
              />
            </Box>
          </Box>

          {[
            ['backgroundColor', 'Фон'],
            ['titleColor', 'Заголовок'],
            ['bodyColor', 'Текст'],
            ['buttonColor', 'Кнопка'],
            ['accentColor', 'Акцент'],
          ].map(([key, label]) => (
            <Box key={key} flex style={{ gap: 8, alignItems: 'center' }}>
              <Label style={{ minWidth: 90 }}>{label}</Label>
              <Input
                type="color"
                value={form.theme[key] || '#ffffff'}
                onChange={(e) => setThemeField(key, e.target.value)}
                style={{ width: 56, padding: 2 }}
              />
              <Input
                value={form.theme[key] || ''}
                onChange={(e) => setThemeField(key, e.target.value)}
              />
            </Box>
          ))}

          <Box flex style={{ gap: 12 }}>
            <Box style={{ flex: 1 }}>
              <Label>Ширина (320–720)</Label>
              <Input
                type="number"
                value={form.theme.modalWidth}
                onChange={(e) =>
                  setThemeField('modalWidth', Number(e.target.value))
                }
              />
            </Box>
            <Box style={{ flex: 1 }}>
              <Label>Скругление (0–32)</Label>
              <Input
                type="number"
                value={form.theme.borderRadius}
                onChange={(e) =>
                  setThemeField('borderRadius', Number(e.target.value))
                }
              />
            </Box>
          </Box>

          <Box marginTop="default" flex style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <CheckBox
              checked={form.theme.showImage !== false}
              onChange={() =>
                setThemeField('showImage', form.theme.showImage === false)
              }
            />
            <Text>Показывать изображение</Text>
            <CheckBox
              checked={form.theme.showActionButton !== false}
              onChange={() =>
                setThemeField(
                  'showActionButton',
                  form.theme.showActionButton === false,
                )
              }
            />
            <Text>Показывать кнопку действия</Text>
            <CheckBox
              checked={form.theme.animationEnabled !== false}
              onChange={() =>
                setThemeField(
                  'animationEnabled',
                  form.theme.animationEnabled === false,
                )
              }
            />
            <Text>Анимация появления</Text>
          </Box>

          <Button
            size="sm"
            variant="text"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                theme: { ...DEFAULT_THEME },
              }))
            }
          >
            Сбросить оформление
          </Button>

          <Box flex style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {!form.id ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void postAction('create')}
              >
                Создать черновик
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void postAction('save')}
                >
                  Сохранить
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void postAction('publish')}
                >
                  Опубликовать
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void postAction('republish')}
                >
                  Опубликовать повторно
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void postAction('unpublish')}
                >
                  Снять с публикации
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void postAction('archive')}
                >
                  В архив
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      typeof window !== 'undefined' &&
                      window.confirm('Удалить объявление безвозвратно?')
                    ) {
                      void postAction('delete');
                    }
                  }}
                >
                  Удалить
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default SiteAnnouncementsAdmin;

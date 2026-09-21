import React, { useCallback, useEffect, useState } from 'react';
import { ApiClient } from 'adminjs';
import {
  Box,
  Button,
  CheckBox,
  Header,
  Input,
  Label,
  MessageBox,
  Text,
  TextArea,
} from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'notificationSounds';

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

const emptyForm = {
  slug: '',
  label: '',
  description: '',
  sortOrder: '100',
  isDefault: false,
};

const NotificationSoundsAdmin = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [createFile, setCreateFile] = useState(null);

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

  const postAction = async (fields) => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const data = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        data.append(key, String(value));
      });
      const response = await api.getPage({
        pageName: PAGE_NAME,
        method: 'post',
        data,
      });
      const payload = response.data ?? response;
      if (payload.notice?.type === 'error') {
        setError(payload.notice.message);
      } else if (payload.notice) {
        setNotice(payload.notice);
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка запроса');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!createFile) {
      setError('Выберите аудиофайл для нового пресета');
      return;
    }
    const fileBase64 = await readFileAsBase64(createFile);
    const payload = await postAction({
      action: 'create',
      slug: form.slug,
      label: form.label,
      description: form.description,
      sortOrder: form.sortOrder,
      isDefault: form.isDefault ? 'true' : 'false',
      fileBase64,
      fileMime: createFile.type || 'audio/mpeg',
      fileName: createFile.name || 'notify.mp3',
    });
    if (payload?.notice?.type !== 'error') {
      setForm(emptyForm);
      setCreateFile(null);
    }
  };

  const handleUpload = async (id, file) => {
    if (!file) return;
    const fileBase64 = await readFileAsBase64(file);
    await postAction({
      action: 'upload',
      id,
      fileBase64,
      fileMime: file.type || 'audio/mpeg',
      fileName: file.name || 'notify.mp3',
    });
  };

  const handleDelete = async (id, label) => {
    if (!window.confirm(`Удалить пресет «${label}»? У пользователей станет дефолтный.`)) {
      return;
    }
    await postAction({ action: 'delete', id });
  };

  const handleSetDefault = async (id) => {
    await postAction({ action: 'setDefault', id });
  };

  const handleToggleActive = async (id, isActive) => {
    await postAction({
      action: 'update',
      id,
      isActive: isActive ? 'false' : 'true',
    });
  };

  if (loading) {
    return (
      <Box variant="grey20" padding="xxl">
        <Text>Загрузка…</Text>
      </Box>
    );
  }

  return (
    <Box variant="grey20" padding="xxl">
      <Header.H2 marginBottom="lg">Звуки уведомлений</Header.H2>
      <Text color="grey60" marginBottom="xl">
        Пресеты для настроек пользователя. Список полностью управляется здесь:
        добавить / заменить файл / дефолт / выкл / удалить.
        «Дефолт» переносит только тех, у кого стоял прежний дефолтный пресет
        (свой загруженный звук не трогаем). Удаление сбрасывает выбор на текущий дефолт.
        Файл ≤ 256 КБ, mp3/ogg/wav/webm.
      </Text>

      {error ? (
        <Box marginBottom="xl">
          <MessageBox message={error} variant="danger" />
        </Box>
      ) : null}
      {notice ? (
        <Box marginBottom="xl">
          <MessageBox message={notice.message} variant={notice.type === 'error' ? 'danger' : 'success'} />
        </Box>
      ) : null}

      <Box variant="white" padding="xl" marginBottom="xxl">
        <Header.H3 marginBottom="lg">Добавить пресет</Header.H3>
        <Box marginBottom="default">
          <Label>Slug</Label>
          <Input
            width={1}
            value={form.slug}
            onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
            placeholder="tavern-knock"
          />
        </Box>
        <Box marginBottom="default">
          <Label>Название</Label>
          <Input
            width={1}
            value={form.label}
            onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="Таверна"
          />
        </Box>
        <Box marginBottom="default">
          <Label>Описание</Label>
          <TextArea
            width={1}
            value={form.description}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, description: e.target.value }))
            }
          />
        </Box>
        <Box marginBottom="default">
          <Label>Порядок</Label>
          <Input
            width={1}
            value={form.sortOrder}
            onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
          />
        </Box>
        <Box marginBottom="default">
          <CheckBox
            checked={form.isDefault}
            onChange={() =>
              setForm((prev) => ({ ...prev, isDefault: !prev.isDefault }))
            }
          />
          <Text as="span" ml="default">
            Сделать дефолтным
          </Text>
        </Box>
        <Box marginBottom="xl">
          <Label>Аудиофайл</Label>
          <input
            type="file"
            accept="audio/*,.mp3,.ogg,.wav,.webm,.m4a"
            onChange={(e) => setCreateFile(e.target.files?.[0] ?? null)}
          />
        </Box>
        <Button variant="primary" onClick={handleCreate} disabled={busy}>
          Создать
        </Button>
      </Box>

      <Box variant="white" padding="xl">
        <Header.H3 marginBottom="lg">Список ({items.length})</Header.H3>
        {items.map((item) => (
          <Box
            key={item.id}
            border="default"
            borderRadius="default"
            padding="lg"
            marginBottom="lg"
          >
            <Box flex flexDirection="row" justifyContent="space-between" flexWrap="wrap">
              <Box>
                <Text fontWeight="bold">
                  {item.label}{' '}
                  <Text as="span" color="grey60">
                    ({item.slug})
                  </Text>
                </Text>
                <Text color="grey60">{item.description || '—'}</Text>
                <Text color="grey60" mt="sm">
                  order={item.sortOrder}
                  {item.isDefault ? ' · DEFAULT' : ''}
                  {item.isActive ? '' : ' · OFF'}
                  {item.hasAudio ? '' : ' · нет файла'}
                  {item.size ? ` · ${item.size} B` : ''}
                </Text>
              </Box>
              <Box flex style={{ gap: 8, alignItems: 'center' }}>
                {item.audioUrl ? (
                  <audio controls src={item.audioUrl} style={{ height: 32, maxWidth: 220 }} />
                ) : null}
              </Box>
            </Box>
            <Box mt="lg" flex flexDirection="row" flexWrap="wrap" style={{ gap: 8 }}>
              <Button
                size="sm"
                onClick={() => handleSetDefault(item.id)}
                disabled={busy || item.isDefault}
              >
                Дефолт
              </Button>
              <Button
                size="sm"
                onClick={() => handleToggleActive(item.id, item.isActive)}
                disabled={busy}
              >
                {item.isActive ? 'Выключить' : 'Включить'}
              </Button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Button size="sm" as="span" disabled={busy}>
                  Заменить файл
                </Button>
                <input
                  type="file"
                  accept="audio/*,.mp3,.ogg,.wav,.webm,.m4a"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleUpload(item.id, file);
                  }}
                />
              </label>
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleDelete(item.id, item.label)}
                disabled={busy}
              >
                Удалить
              </Button>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default NotificationSoundsAdmin;

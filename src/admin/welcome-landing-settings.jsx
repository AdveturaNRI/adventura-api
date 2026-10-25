import React, { useEffect, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Box, Button, CheckBox, Header, Input, Label, MessageBox, Text } from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'welcomeLanding';

const WelcomeLandingSettings = () => {
  const [url, setUrl] = useState('');
  const [showOnFirstVisit, setShowOnFirstVisit] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const applyPayload = (payload) => {
    setUrl(payload.url ?? '');
    setShowOnFirstVisit(payload.showOnFirstVisit !== false);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.getPage({ pageName: PAGE_NAME });
        if (!cancelled) applyPayload(response.data ?? response);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить настройки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('url', url);
      form.append('showOnFirstVisit', showOnFirstVisit ? 'true' : 'false');
      const response = await api.getPage({ pageName: PAGE_NAME, method: 'post', data: form });
      const payload = response.data ?? response;
      applyPayload(payload);
      setNotice(payload.notice ?? { message: 'Сохранено', type: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box variant="grey20" padding="xxl"><Text>Загрузка…</Text></Box>;

  return (
    <Box variant="grey20" padding="xxl">
      <Header.H2 marginBottom="lg">Приветствие и «О проекте»</Header.H2>
      <Text color="grey60" marginBottom="xl" style={{ maxWidth: 640, lineHeight: 1.5 }}>
        Эта ссылка открывается из пункта меню «О проекте». Если включить показ новым посетителям, каждый, кто
        впервые открыл главную, один раз попадёт сюда сам: и гость, и пользователь с аккаунтом. Показ
        запоминается на устройстве, после смены ссылки приветствие покажется снова. Пустое поле выключает всё.
      </Text>
      {error ? <Box marginBottom="xl"><MessageBox message={error} variant="danger" /></Box> : null}
      {notice ? <Box marginBottom="xl"><MessageBox message={notice.message} variant={notice.type === 'error' ? 'danger' : 'success'} /></Box> : null}
      <Box variant="white" boxShadow="card" padding="xl" style={{ borderRadius: 12, maxWidth: 520 }}>
        <Label>Ссылка на лендинг</Label>
        <Input width={1} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="/l/welcome или https://…" mb="sm" />
        <Text color="grey60" mb="xl" style={{ fontSize: 12 }}>
          Ссылка, начинающаяся с <code>/</code>, откроется внутри приложения, а <code>https://</code> откроется как внешняя.
        </Text>
        <Label mb="sm">
          <CheckBox
            checked={showOnFirstVisit}
            onChange={(event) => setShowOnFirstVisit(event.target.checked)}
          />{' '}
          Показывать новым посетителям при первом заходе
        </Label>
        <Text color="grey60" mb="xl" style={{ fontSize: 12 }}>
          Выключено — главная открывается как обычно, лендинг доступен только из «О проекте».
        </Text>
        <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
      </Box>
    </Box>
  );
};

export default WelcomeLandingSettings;

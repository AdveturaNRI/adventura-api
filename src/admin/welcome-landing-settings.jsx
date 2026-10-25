import React, { useEffect, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Box, Button, Header, Input, Label, MessageBox, Text } from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'welcomeLanding';

const WelcomeLandingSettings = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.getPage({ pageName: PAGE_NAME });
        if (!cancelled) setUrl((response.data ?? response).url ?? '');
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
      const response = await api.getPage({ pageName: PAGE_NAME, method: 'post', data: form });
      const payload = response.data ?? response;
      setUrl(payload.url ?? '');
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
        Гость, который впервые открыл главную, один раз попадёт по этой ссылке. Эта же ссылка открывается
        из пункта меню «О проекте». Пустое поле выключает и то, и другое.
      </Text>
      {error ? <Box marginBottom="xl"><MessageBox message={error} variant="danger" /></Box> : null}
      {notice ? <Box marginBottom="xl"><MessageBox message={notice.message} variant={notice.type === 'error' ? 'danger' : 'success'} /></Box> : null}
      <Box variant="white" boxShadow="card" padding="xl" style={{ borderRadius: 12, maxWidth: 520 }}>
        <Label>Ссылка на лендинг</Label>
        <Input width={1} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="/l/welcome или https://…" mb="sm" />
        <Text color="grey60" mb="xl" style={{ fontSize: 12 }}>
          Ссылка, начинающаяся с <code>/</code>, откроется внутри приложения, а <code>https://</code> откроется как внешняя.
        </Text>
        <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
      </Box>
    </Box>
  );
};

export default WelcomeLandingSettings;

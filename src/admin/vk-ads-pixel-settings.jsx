import React, { useEffect, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Box, Button, Header, Input, Label, MessageBox, Text } from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'vkAdsPixelSettings';

const VkAdsPixelSettings = () => {
  const [pixelId, setPixelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.getPage({ pageName: PAGE_NAME });
        if (!cancelled) setPixelId((response.data ?? response).pixelId ?? '');
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
      form.append('pixelId', pixelId);
      const response = await api.getPage({ pageName: PAGE_NAME, method: 'post', data: form });
      const payload = response.data ?? response;
      setPixelId(payload.pixelId ?? '');
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
      <Header.H2 marginBottom="lg">VK Ads Pixel</Header.H2>
      <Text color="grey60" marginBottom="xl">
        ID пикселя хранится в базе и выдаётся web-клиенту через <code>/api/config/public</code>.
        Пустое поле выключает пиксель. Это публичный ID, не API-ключ и не секрет.
      </Text>
      {error ? <Box marginBottom="xl"><MessageBox message={error} variant="danger" /></Box> : null}
      {notice ? <Box marginBottom="xl"><MessageBox message={notice.message} variant={notice.type === 'error' ? 'danger' : 'success'} /></Box> : null}
      <Box variant="white" boxShadow="card" padding="xl" style={{ borderRadius: 12, maxWidth: 520 }}>
        <Label>ID пикселя VK Ads</Label>
        <Input width={1} value={pixelId} onChange={(event) => setPixelId(event.target.value)} placeholder="например 1234567" mb="xl" />
        <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
      </Box>
    </Box>
  );
};

export default VkAdsPixelSettings;

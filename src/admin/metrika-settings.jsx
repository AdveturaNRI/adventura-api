import React, { useEffect, useState } from 'react';
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
} from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'metrikaSettings';

const MetrikaSettings = () => {
  const [counterId, setCounterId] = useState('');
  const [webvisor, setWebvisor] = useState(true);
  const [clickmap, setClickmap] = useState(true);
  const [trackLinks, setTrackLinks] = useState(true);
  const [accurateTrackBounce, setAccurateTrackBounce] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api.getPage({ pageName: PAGE_NAME });
        const payload = response.data ?? response;
        if (cancelled) return;
        setCounterId(payload.counterId ?? '');
        setWebvisor(Boolean(payload.webvisor));
        setClickmap(Boolean(payload.clickmap));
        setTrackLinks(Boolean(payload.trackLinks));
        setAccurateTrackBounce(Boolean(payload.accurateTrackBounce));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Не удалось загрузить настройки',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const form = new FormData();
      form.append('counterId', counterId);
      form.append('webvisor', webvisor ? 'true' : 'false');
      form.append('clickmap', clickmap ? 'true' : 'false');
      form.append('trackLinks', trackLinks ? 'true' : 'false');
      form.append(
        'accurateTrackBounce',
        accurateTrackBounce ? 'true' : 'false',
      );

      const response = await api.getPage({
        pageName: PAGE_NAME,
        method: 'post',
        data: form,
      });
      const payload = response.data ?? response;
      setCounterId(payload.counterId ?? '');
      setWebvisor(Boolean(payload.webvisor));
      setClickmap(Boolean(payload.clickmap));
      setTrackLinks(Boolean(payload.trackLinks));
      setAccurateTrackBounce(Boolean(payload.accurateTrackBounce));
      if (payload.notice) {
        setNotice(payload.notice);
      } else {
        setNotice({ message: 'Сохранено', type: 'success' });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не удалось сохранить настройки',
      );
    } finally {
      setSaving(false);
    }
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
      <Header.H2 marginBottom="lg">Яндекс Метрика</Header.H2>
      <Text color="grey60" marginBottom="xl">
        ID счётчика подхватывает web-клиент через <code>/api/config/public</code>.
        Пустой ID — Метрика выключена. В кабинете Метрики заведи goals:
        session_started, register, profile_created, listing_created,
        application_sent, match_completed, club_created, open_club, open_player,
        open_game.
      </Text>

      {error ? (
        <Box marginBottom="xl">
          <MessageBox message={error} variant="danger" />
        </Box>
      ) : null}
      {notice ? (
        <Box marginBottom="xl">
          <MessageBox
            message={notice.message}
            variant={notice.type === 'error' ? 'danger' : 'success'}
          />
        </Box>
      ) : null}

      <Box
        variant="white"
        boxShadow="card"
        padding="xl"
        style={{ borderRadius: 12, maxWidth: 520 }}
      >
        <Label>ID счётчика</Label>
        <Input
          width={1}
          value={counterId}
          onChange={(e) => setCounterId(e.target.value)}
          placeholder="например 12345678"
          mb="xl"
        />

        <Box display="flex" flexDirection="column" style={{ gap: 12 }} mb="xl">
          <Label>
            <CheckBox
              checked={webvisor}
              onChange={(e) => setWebvisor(e.target.checked)}
            />{' '}
            Вебвизор
          </Label>
          <Label>
            <CheckBox
              checked={clickmap}
              onChange={(e) => setClickmap(e.target.checked)}
            />{' '}
            Карта кликов
          </Label>
          <Label>
            <CheckBox
              checked={trackLinks}
              onChange={(e) => setTrackLinks(e.target.checked)}
            />{' '}
            Отслеживание ссылок
          </Label>
          <Label>
            <CheckBox
              checked={accurateTrackBounce}
              onChange={(e) => setAccurateTrackBounce(e.target.checked)}
            />{' '}
            Точный показатель отказов
          </Label>
        </Box>

        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </Box>
    </Box>
  );
};

export default MetrikaSettings;

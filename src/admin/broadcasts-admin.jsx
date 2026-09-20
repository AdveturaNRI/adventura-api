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
  Select,
  Text,
  TextArea,
} from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'broadcasts';

const boolOptions = [
  { value: 'any', label: 'Любые' },
  { value: 'true', label: 'Да' },
  { value: 'false', label: 'Нет' },
];

const emptyForm = {
  title: '',
  body: '',
  audience: 'registered',
  emailVerified: 'any',
  rolesAny: '',
  playsOnline: 'any',
  prefersFreeOnly: 'any',
  hasLocation: 'any',
  cityId: '',
  lastSeenWithinDays: '',
  registeredWithinDays: '',
  hasPushSubscription: 'any',
  minQuestionnaireStep: '',
  sendInApp: true,
  sendPush: true,
};

function BroadcastsAdmin() {
  const [form, setForm] = useState(emptyForm);
  const [previewCount, setPreviewCount] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
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
      setCampaigns(Array.isArray(payload.campaigns) ? payload.campaigns : []);
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
    setPreviewCount(null);
  };

  const buildPayload = (action) => ({
    action,
    title: form.title,
    body: form.body,
    sendInApp: form.sendInApp ? 'true' : 'false',
    sendPush: form.sendPush ? 'true' : 'false',
    audience: form.audience,
    emailVerified: form.emailVerified,
    rolesAny: form.rolesAny,
    playsOnline: form.playsOnline,
    prefersFreeOnly: form.prefersFreeOnly,
    hasLocation: form.hasLocation,
    cityId: form.cityId,
    lastSeenWithinDays: form.lastSeenWithinDays,
    registeredWithinDays: form.registeredWithinDays,
    hasPushSubscription: form.hasPushSubscription,
    minQuestionnaireStep: form.minQuestionnaireStep,
  });

  const postAction = async (action) => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const data = new FormData();
      const fields = buildPayload(action);
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
      if (payload.error) {
        throw new Error(String(payload.error));
      }
      if (action === 'preview') {
        setPreviewCount(
          typeof payload.count === 'number' ? payload.count : null,
        );
        setNotice(`Получателей: ${payload.count ?? 0}`);
      } else if (action === 'send') {
        setNotice(
          `Отправлено: ${payload.campaign?.sentCount ?? 0} (push: ${
            payload.campaign?.pushCount ?? 0
          })`,
        );
        setForm(emptyForm);
        setPreviewCount(null);
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box variant="grey100" padding="xl">
      <Header.H2>Массовые оповещения</Header.H2>
      <Text marginBottom="lg" color="grey60">
        In-app уведомление + опциональный push. Можно слать всем аккаунтам,
        только пользователям, только гостям или по фильтрам. Actor — ADMIN_EMAIL
        (или первый пользователь).
      </Text>

      {notice ? (
        <MessageBox message={notice} variant="info" marginBottom="default" />
      ) : null}
      {error ? (
        <MessageBox message={error} variant="danger" marginBottom="default" />
      ) : null}

      <Box variant="white" padding="xl" boxShadow="card" marginBottom="xl">
        <Header.H4>Новая рассылка</Header.H4>

        <Box marginTop="lg">
          <Label>Заголовок</Label>
          <Input
            width={1}
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="Техработы / Новая фича / …"
          />
        </Box>

        <Box marginTop="default">
          <Label>Текст</Label>
          <TextArea
            width={1}
            value={form.body}
            onChange={(e) => setField('body', e.target.value)}
            rows={4}
            placeholder="Что сообщить пользователям"
          />
        </Box>

        <Box marginTop="lg" flex style={{ gap: 24, flexWrap: 'wrap' }}>
          <CheckBox
            checked={form.sendInApp}
            onChange={() => setField('sendInApp', !form.sendInApp)}
          />
          <Text>In-app (колокольчик)</Text>
          <CheckBox
            checked={form.sendPush}
            onChange={() => setField('sendPush', !form.sendPush)}
          />
          <Text>Push (FCM / web-push)</Text>
        </Box>

        <Box marginTop="xl">
          <Header.H5>Аудитория</Header.H5>
          <Box marginTop="default">
            <Label>Режим</Label>
            <Select
              value={form.audience}
              onChange={(selected) =>
                setField(
                  'audience',
                  selected?.value ?? selected ?? 'registered',
                )
              }
              options={[
                {
                  value: 'everyone',
                  label: 'Все без исключения (пользователи + гости)',
                },
                {
                  value: 'registered',
                  label: 'Только зарегистрированные',
                },
                { value: 'guests', label: 'Только гости' },
                {
                  value: 'filtered',
                  label: 'Зарегистрированные + фильтры',
                },
              ]}
            />
          </Box>

          {form.audience === 'filtered' ? (
            <Box marginTop="lg" flex flexDirection="column" style={{ gap: 12 }}>
              <Box>
                <Label>Email подтверждён</Label>
                <Select
                  value={form.emailVerified}
                  onChange={(s) =>
                    setField('emailVerified', s?.value ?? s ?? 'any')
                  }
                  options={boolOptions}
                />
              </Box>
              <Box>
                <Label>Роли (через запятую: master, player…)</Label>
                <Input
                  width={1}
                  value={form.rolesAny}
                  onChange={(e) => setField('rolesAny', e.target.value)}
                />
              </Box>
              <Box>
                <Label>Играет онлайн</Label>
                <Select
                  value={form.playsOnline}
                  onChange={(s) =>
                    setField('playsOnline', s?.value ?? s ?? 'any')
                  }
                  options={boolOptions}
                />
              </Box>
              <Box>
                <Label>Только бесплатные столы</Label>
                <Select
                  value={form.prefersFreeOnly}
                  onChange={(s) =>
                    setField('prefersFreeOnly', s?.value ?? s ?? 'any')
                  }
                  options={boolOptions}
                />
              </Box>
              <Box>
                <Label>Есть локация / онлайн</Label>
                <Select
                  value={form.hasLocation}
                  onChange={(s) =>
                    setField('hasLocation', s?.value ?? s ?? 'any')
                  }
                  options={boolOptions}
                />
              </Box>
              <Box>
                <Label>cityId (точно)</Label>
                <Input
                  width={1}
                  value={form.cityId}
                  onChange={(e) => setField('cityId', e.target.value)}
                />
              </Box>
              <Box>
                <Label>Был в сети за N дней</Label>
                <Input
                  width={1}
                  value={form.lastSeenWithinDays}
                  onChange={(e) =>
                    setField('lastSeenWithinDays', e.target.value)
                  }
                  placeholder="например 30"
                />
              </Box>
              <Box>
                <Label>Зарегистрирован за N дней</Label>
                <Input
                  width={1}
                  value={form.registeredWithinDays}
                  onChange={(e) =>
                    setField('registeredWithinDays', e.target.value)
                  }
                />
              </Box>
              <Box>
                <Label>Есть push-подписка</Label>
                <Select
                  value={form.hasPushSubscription}
                  onChange={(s) =>
                    setField('hasPushSubscription', s?.value ?? s ?? 'any')
                  }
                  options={boolOptions}
                />
              </Box>
              <Box>
                <Label>questionnaireStep ≥</Label>
                <Input
                  width={1}
                  value={form.minQuestionnaireStep}
                  onChange={(e) =>
                    setField('minQuestionnaireStep', e.target.value)
                  }
                />
              </Box>
            </Box>
          ) : null}
        </Box>

        <Box marginTop="xl" flex style={{ gap: 12, flexWrap: 'wrap' }}>
          <Button
            variant="text"
            disabled={busy}
            onClick={() => void postAction('preview')}>
            Посчитать получателей
            {previewCount != null ? ` (${previewCount})` : ''}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !form.title.trim() || !form.body.trim()}
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                !window.confirm(
                  `Отправить рассылку${
                    previewCount != null ? ` ~${previewCount} пользователям` : ''
                  }?`,
                )
              ) {
                return;
              }
              void postAction('send');
            }}>
            {busy ? 'Отправка…' : 'Отправить'}
          </Button>
        </Box>
      </Box>

      <Box variant="white" padding="xl" boxShadow="card">
        <Header.H4>История</Header.H4>
        {loading ? (
          <Text marginTop="default">Загрузка…</Text>
        ) : campaigns.length === 0 ? (
          <Text marginTop="default" color="grey60">
            Пока пусто
          </Text>
        ) : (
          campaigns.map((c) => (
            <Box
              key={c.id}
              marginTop="lg"
              padding="default"
              style={{ borderTop: '1px solid #e5e7eb' }}>
              <Text fontWeight="bold">
                {c.title}{' '}
                <Text as="span" color="grey60" fontWeight="normal">
                  · {c.status}
                </Text>
              </Text>
              <Text color="grey60" fontSize={12} marginTop="sm">
                {new Date(c.createdAt).toLocaleString('ru-RU')} · получателей{' '}
                {c.recipientCount} · отправлено {c.sentCount} · push{' '}
                {c.pushCount}
                {c.sendInApp ? ' · in-app' : ''}
                {c.sendPush ? ' · push' : ''}
              </Text>
              <Text marginTop="sm">{c.body}</Text>
              {c.error ? (
                <Text color="error" marginTop="sm">
                  {c.error}
                </Text>
              ) : null}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

export default BroadcastsAdmin;

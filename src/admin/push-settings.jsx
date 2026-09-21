import React, { useEffect, useState } from 'react';
import { ApiClient } from 'adminjs';
import {
  Box,
  Button,
  Header,
  Input,
  Label,
  MessageBox,
  Text,
  TextArea,
} from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'pushSettings';

const PushSettings = () => {
  const [webVapidKey, setWebVapidKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [serviceAccountConfigured, setServiceAccountConfigured] = useState(false);
  const [envVapidConfigured, setEnvVapidConfigured] = useState(false);
  const [envServiceAccountConfigured, setEnvServiceAccountConfigured] =
    useState(false);
  const [subscribeEnabled, setSubscribeEnabled] = useState(false);
  const [sendEnabled, setSendEnabled] = useState(false);
  const [provider, setProvider] = useState('none');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [clearSa, setClearSa] = useState(false);

  const applyPayload = (payload) => {
    setWebVapidKey(payload.webVapidKey ?? '');
    setProjectId(payload.projectId ?? '');
    setServiceAccountConfigured(Boolean(payload.serviceAccountConfigured));
    setEnvVapidConfigured(Boolean(payload.envVapidConfigured));
    setEnvServiceAccountConfigured(Boolean(payload.envServiceAccountConfigured));
    setSubscribeEnabled(Boolean(payload.subscribeEnabled));
    setSendEnabled(Boolean(payload.sendEnabled));
    setProvider(payload.provider ?? 'none');
    setServiceAccountJson('');
    setClearSa(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api.getPage({ pageName: PAGE_NAME });
        const payload = response.data ?? response;
        if (cancelled) return;
        applyPayload(payload);
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
      form.append('webVapidKey', webVapidKey);
      form.append('projectId', projectId);
      if (clearSa) {
        form.append('serviceAccountJson', '');
        form.append('clearServiceAccount', 'true');
      } else if (serviceAccountJson.trim()) {
        form.append('serviceAccountJson', serviceAccountJson.trim());
      }

      const response = await api.getPage({
        pageName: PAGE_NAME,
        method: 'post',
        data: form,
      });
      const payload = response.data ?? response;
      if (payload.error) {
        throw new Error(String(payload.error));
      }
      applyPayload(payload);
      setNotice(
        payload.notice ?? {
          message: 'Сохранено. Обнови клиент (F5) и включи пуши в Настройках.',
          type: 'success',
        },
      );
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
      <Header.H2 marginBottom="lg">Web Push / FCM</Header.H2>

      <Box variant="white" padding="xl" boxShadow="card" marginBottom="xl">
        <Header.H4>Как настроить (минимум для включения пушей)</Header.H4>
        <Text marginTop="default" style={{ lineHeight: 1.55 }}>
          1. Открой{' '}
          <a
            href="https://console.firebase.google.com/project/adventu-1ee37/settings/cloudmessaging"
            target="_blank"
            rel="noreferrer">
            Firebase Console → Cloud Messaging
          </a>
          .
          <br />
          2. Блок <strong>Web Push certificates</strong> → Generate key pair (если
          ещё нет) → скопируй <strong>Public key</strong> (длинная строка, обычно
          с «B»).
          <br />
          3. Вставь его в поле <strong>Web Push VAPID key</strong> ниже.
          <br />
          4. Project ID: <code>adventu-1ee37</code>.
          <br />
          5. Поле <strong>Service account JSON оставь пустым</strong> на этом шаге.
          <br />
          6. Нажми Сохранить → статус «Подписка» должен стать OK → в клиенте F5 →
          включи «Браузерные уведомления».
        </Text>
        <Text color="grey60" marginTop="lg" style={{ lineHeight: 1.5 }}>
          Service account нужен только чтобы <em>сервер слал</em> пуши в фоне.
          Это другой файл: Project settings → Service accounts → Generate new
          private key → JSON с <code>&quot;type&quot;: &quot;service_account&quot;</code>. Не путай с
          web-config (apiKey / appId) — тот уже в клиенте.
        </Text>
      </Box>

      <Box
        variant="white"
        padding="xl"
        boxShadow="card"
        marginBottom="xl"
        style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Text>
          Подписка (клиент):{' '}
          <strong>{subscribeEnabled ? 'OK' : 'выкл — нет VAPID'}</strong>
        </Text>
        <Text>
          Отправка (сервер):{' '}
          <strong>{sendEnabled ? 'OK' : 'выкл — нет service account'}</strong>
        </Text>
        <Text>
          Provider: <strong>{provider}</strong>
        </Text>
      </Box>

      {error ? (
        <Box marginBottom="xl">
          <MessageBox message={error} variant="danger" />
        </Box>
      ) : null}
      {notice ? (
        <Box marginBottom="xl">
          <MessageBox
            message={notice.message ?? String(notice)}
            variant={notice.type === 'error' ? 'danger' : 'info'}
          />
        </Box>
      ) : null}

      <Box variant="white" padding="xl" boxShadow="card">
        <Box marginBottom="lg">
          <Label>1. Web Push VAPID key (public) — обязательно</Label>
          <Input
            width={1}
            value={webVapidKey}
            onChange={(e) => setWebVapidKey(e.target.value)}
            placeholder="BNxxxx… (Public key из Web Push certificates)"
          />
          {envVapidConfigured && !webVapidKey ? (
            <Text color="grey60" fontSize={12} marginTop="sm">
              Сейчас используется ключ из .env. Поле выше переопределит его в БД.
            </Text>
          ) : null}
        </Box>

        <Box marginBottom="lg">
          <Label>2. Firebase project ID</Label>
          <Input
            width={1}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="adventu-1ee37"
          />
        </Box>

        <Box marginBottom="lg">
          <Label>
            3. Service account JSON (опционально){' '}
            {serviceAccountConfigured ? '— уже задан' : '— не задан, можно пусто'}
          </Label>
          <Text color="grey60" fontSize={12} marginBottom="default">
            Не вставляй сюда apiKey/appId. Только JSON с type:
            &quot;service_account&quot;. Для теста подписки оставь пустым.
          </Text>
          <TextArea
            width={1}
            rows={6}
            value={serviceAccountJson}
            onChange={(e) => setServiceAccountJson(e.target.value)}
            placeholder='Оставь пустым ИЛИ вставь {"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
          />
          {envServiceAccountConfigured ? (
            <Text color="grey60" fontSize={12} marginTop="sm">
              Также есть service account в .env / PATH.
            </Text>
          ) : null}
          {serviceAccountConfigured ? (
            <Box marginTop="default">
              <Button
                size="sm"
                variant={clearSa ? 'danger' : 'text'}
                onClick={() => setClearSa((v) => !v)}>
                {clearSa
                  ? 'Отмена очистки DB-ключа'
                  : 'Очистить service account из БД'}
              </Button>
            </Box>
          ) : null}
        </Box>

        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </Box>
    </Box>
  );
};

export default PushSettings;

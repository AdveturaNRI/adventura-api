import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Box, Button, Header, Input, Label, MessageBox, Select, Text, TextArea } from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'marketingCampaigns';

const PLATFORMS = [
  { value: 'YANDEX_DIRECT', label: 'Яндекс Директ', source: 'yandex', medium: 'cpc' },
  { value: 'TELEGRAM', label: 'Telegram (ads / каналы)', source: 'telegram', medium: 'social' },
  { value: 'TIKTOK', label: 'TikTok', source: 'tiktok', medium: 'paid_social' },
  { value: 'OTHER', label: 'Другое / ручное', source: 'other', medium: 'referral' },
];

const STATUSES = [
  { value: 'DRAFT', label: 'Черновик' },
  { value: 'READY', label: 'Готова к запуску' },
  { value: 'ACTIVE', label: 'Активна' },
  { value: 'PAUSED', label: 'На паузе' },
  { value: 'COMPLETED', label: 'Завершена' },
  { value: 'ARCHIVED', label: 'Архив' },
];

const OBJECTIVES = [
  { value: 'registrations', label: 'Регистрации в Adventura', text: 'Привести новых пользователей до завершённой регистрации' },
  { value: 'applications', label: 'Заявки в игры', text: 'Довести до отправки заявки на игру' },
  { value: 'awareness', label: 'Узнаваемость', text: 'Охват и просмотры лендинга, без жёсткой конверсии' },
  { value: 'retargeting', label: 'Ретаргет', text: 'Вернуть тех, кто уже был на лендинге / в приложении' },
  { value: 'custom', label: 'Своя формулировка…', text: '' },
];

function pickOption(options, value) {
  if (value == null || value === '') return null;
  return options.find((o) => o.value === value) ?? null;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'campaign';
}

function FieldHint({ children }) {
  return (
    <Text mt="sm" color="grey60" style={{ fontSize: 12, lineHeight: 1.45 }}>
      {children}
    </Text>
  );
}

function platformLabel(value) {
  return pickOption(PLATFORMS, value)?.label || value || '—';
}

export default function MarketingCampaignsAdmin() {
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [landings, setLandings] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [campaign, setCampaign] = useState(null);
  const [variantUrl, setVariantUrl] = useState(null);
  const [webPublicUrl, setWebPublicUrl] = useState('');

  const [createName, setCreateName] = useState('');
  const [createPlatform, setCreatePlatform] = useState('TELEGRAM');
  const [createObjectiveKey, setCreateObjectiveKey] = useState('registrations');
  const [createObjectiveCustom, setCreateObjectiveCustom] = useState('');
  const [createDescription, setCreateDescription] = useState('');

  const [edit, setEdit] = useState(null);

  const [variantLandingId, setVariantLandingId] = useState('');
  const [variantName, setVariantName] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [utmTerm, setUtmTerm] = useState('');

  const load = useCallback(async () => {
    const r = await api.getPage({ pageName: PAGE_NAME });
    const p = r.data ?? r;
    setCampaigns(p.campaigns ?? []);
    setLandings(p.landings ?? []);
    setWebPublicUrl(p.webPublicUrl ?? '');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const campaignOptions = useMemo(
    () =>
      (campaigns ?? []).map((c) => ({
        value: c.id,
        label: `${c.name} · ${platformLabel(c.platform)} · ${pickOption(STATUSES, c.status)?.label || c.status}`,
      })),
    [campaigns],
  );

  const landingOptions = useMemo(
    () =>
      (landings ?? []).map((l) => ({
        value: l.id,
        label: `${l.name} · /l/${l.slug} · ${l.status === 'PUBLISHED' ? 'опубликован' : l.status}`,
      })),
    [landings],
  );

  const syncEdit = (c) => {
    if (!c) {
      setEdit(null);
      return;
    }
    setEdit({
      name: c.name ?? '',
      platform: c.platform ?? 'OTHER',
      status: c.status ?? 'DRAFT',
      description: c.description ?? '',
      objective: c.objective ?? '',
      plannedBudget: c.plannedBudget != null ? String(c.plannedBudget) : '',
      currency: c.currency ?? 'RUB',
      externalCampaignId: c.externalCampaignId ?? '',
      startsAt: c.startsAt ? String(c.startsAt).slice(0, 10) : '',
      endsAt: c.endsAt ? String(c.endsAt).slice(0, 10) : '',
    });
  };

  const post = async (payload) => {
    setBusy(true);
    try {
      const data = new FormData();
      Object.entries(payload).forEach(([k, v]) => data.append(k, v ?? ''));
      const r = await api.getPage({ pageName: PAGE_NAME, method: 'post', data });
      const p = r.data ?? r;
      setCampaigns(p.campaigns ?? []);
      setLandings(p.landings ?? []);
      setWebPublicUrl(p.webPublicUrl ?? '');
      if (p.campaign) {
        setCampaign(p.campaign);
        syncEdit(p.campaign);
      }
      if (p.variantUrl) setVariantUrl(p.variantUrl);
      if (p.notice) setNotice(p.notice);
      return p;
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить действие' });
      return {};
    } finally {
      setBusy(false);
    }
  };

  const refreshCampaign = async (id) => {
    const p = await post({ action: 'getCampaign', id });
    setSelectedId(id);
    setCampaign(p.campaign ?? null);
    setVariantUrl(null);
    syncEdit(p.campaign);
    const plat = pickOption(PLATFORMS, p.campaign?.platform);
    setUtmSource(plat?.source || 'other');
    setUtmMedium(plat?.medium || 'referral');
    setUtmCampaign(slugify(p.campaign?.name));
    setVariantName('');
    setUtmContent('');
    setUtmTerm('');
    const published = (p.landings ?? landings).find((l) => l.status === 'PUBLISHED');
    setVariantLandingId(published?.id || '');
  };

  const resolveObjective = () => {
    const preset = pickOption(OBJECTIVES, createObjectiveKey);
    if (createObjectiveKey === 'custom') return createObjectiveCustom.trim();
    return preset?.text || '';
  };

  const createCampaign = async (e) => {
    e.preventDefault();
    if (!createName.trim()) {
      setNotice({ type: 'error', message: 'Укажи название кампании' });
      return;
    }
    const name = createName.trim();
    const p = await post({
      action: 'createCampaign',
      name,
      platform: createPlatform,
      description: createDescription,
      objective: resolveObjective(),
    });
    setCreateName('');
    setCreateDescription('');
    setCreateObjectiveCustom('');
    const created = (p.campaigns ?? []).find((c) => c.name === name);
    if (created) await refreshCampaign(created.id);
  };

  const saveCampaign = async (e) => {
    e.preventDefault();
    if (!campaign?.id || !edit) return;
    const result = await post({
      action: 'updateCampaign',
      id: campaign.id,
      name: edit.name,
      description: edit.description,
      objective: edit.objective,
      platform: edit.platform,
      status: edit.status,
      plannedBudget: edit.plannedBudget,
      currency: edit.currency,
      externalCampaignId: edit.externalCampaignId,
      startsAt: edit.startsAt ? new Date(`${edit.startsAt}T00:00:00.000Z`).toISOString() : '',
      endsAt: edit.endsAt ? new Date(`${edit.endsAt}T23:59:59.999Z`).toISOString() : '',
    });
    await refreshCampaign(campaign.id);
    if (result.variantUrl) setVariantUrl(result.variantUrl);
  };

  const createVariant = async (e) => {
    e.preventDefault();
    if (!campaign?.id) return;
    if (!variantLandingId) {
      setNotice({ type: 'error', message: 'Выбери лендинг' });
      return;
    }
    if (!variantName.trim() || !utmSource.trim() || !utmMedium.trim() || !utmCampaign.trim()) {
      setNotice({ type: 'error', message: 'Нужны название варианта и utm_source / medium / campaign' });
      return;
    }
    await post({
      action: 'createVariant',
      campaignId: campaign.id,
      landingId: variantLandingId,
      variantName: variantName.trim(),
      utmSource: utmSource.trim(),
      utmMedium: utmMedium.trim(),
      utmCampaign: utmCampaign.trim(),
      utmContent: utmContent.trim(),
      utmTerm: utmTerm.trim(),
    });
    await refreshCampaign(campaign.id);
  };

  const loadVariantUrl = async (variantId) => {
    const p = await post({ action: 'getVariantUrl', variantId });
    setVariantUrl(p.variantUrl ?? null);
  };

  const copyVariantUrl = async () => {
    if (!variantUrl?.url) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API недоступен');
      await navigator.clipboard.writeText(variantUrl.url);
      setNotice({ type: 'success', message: 'Ссылка скопирована' });
    } catch {
      window.prompt('Скопируй ссылку:', variantUrl.url);
    }
  };

  const applyPlatformUtm = (platformValue) => {
    const plat = pickOption(PLATFORMS, platformValue);
    if (!plat) return;
    setUtmSource(plat.source);
    setUtmMedium(plat.medium);
  };

  const qrUrl = variantUrl?.url
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(variantUrl.url)}`
    : null;

  return (
    <Box variant="grey20" padding="xxl">
      <Header.H2>Маркетинг · Кампании</Header.H2>
      <Box mt="md" p="lg" variant="white" style={{ borderRadius: 12, maxWidth: 900 }}>
        <Text fontWeight="bold">Как настроить рекламу</Text>
        <Text mt="sm" color="grey60" style={{ lineHeight: 1.5 }}>
          1) Опубликуй лендинг → 2) Создай кампанию (источник трафика) → 3) Добавь вариант: лендинг + UTM.
          После создания сразу появятся готовая ссылка и QR. Один вариант = один креатив или одна аудитория.
        </Text>
        {webPublicUrl ? (
          <FieldHint>Ссылки будут вести на: {webPublicUrl}</FieldHint>
        ) : (
          <MessageBox mt="sm" message="Не задан WEB_PUBLIC_URL: админка не сможет сформировать рекламную ссылку." variant="warning" />
        )}
      </Box>

      {notice && (
        <MessageBox mt="lg" message={notice.message} variant={notice.type === 'error' ? 'danger' : 'success'} />
      )}

      <Box mt="xl" display="grid" style={{ gridTemplateColumns: '340px minmax(0, 1fr)', gap: 24, maxWidth: 1480 }}>
        <Box>
          <Header.H4>Кампании</Header.H4>
          <Select
            options={campaignOptions}
            value={pickOption(campaignOptions, selectedId)}
            onChange={(v) => {
              const id = v?.value || '';
              setSelectedId(id);
              if (id) void refreshCampaign(id);
            }}
            placeholder="Выбери кампанию…"
          />

          <Box mt="xl" variant="white" p="lg" style={{ borderRadius: 14 }}>
            <Header.H4>Новая кампания</Header.H4>
            <form onSubmit={createCampaign}>
              <Label mt="md">Название</Label>
              <Input width={1} value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Напр. TG апрель — регистрации" required />
              <FieldHint>Внутреннее имя для отчётов, не видно пользователю.</FieldHint>

              <Label mt="md">Платформа (откуда льём)</Label>
              <Select
                options={PLATFORMS}
                value={pickOption(PLATFORMS, createPlatform)}
                onChange={(v) => setCreatePlatform(v?.value || 'OTHER')}
              />
              <FieldHint>Нужна для фильтров в аналитике и автоподстановки utm_source.</FieldHint>

              <Label mt="md">Цель кампании</Label>
              <Select
                options={OBJECTIVES}
                value={pickOption(OBJECTIVES, createObjectiveKey)}
                onChange={(v) => setCreateObjectiveKey(v?.value || 'registrations')}
              />
              {createObjectiveKey === 'custom' ? (
                <TextArea
                  mt="sm"
                  width={1}
                  value={createObjectiveCustom}
                  onChange={(e) => setCreateObjectiveCustom(e.target.value)}
                  placeholder="Своими словами: что считаем успехом"
                />
              ) : (
                <FieldHint>{pickOption(OBJECTIVES, createObjectiveKey)?.text}</FieldHint>
              )}

              <Label mt="md">Заметка (необязательно)</Label>
              <TextArea width={1} value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} placeholder="Креативы, аудитория, бюджет в голове…" />

              <Button mt="lg" variant="primary" disabled={busy} type="submit">
                Создать кампанию
              </Button>
            </form>
          </Box>
        </Box>

        <Box variant="white" p="xl" style={{ borderRadius: 14, minWidth: 0 }}>
          {!campaign && <Text color="grey60">Выбери кампанию слева или создай новую.</Text>}

          {campaign && edit && (
            <>
              <Header.H4>{campaign.name}</Header.H4>
              <Text color="grey60">
                {platformLabel(campaign.platform)} · {pickOption(STATUSES, campaign.status)?.label || campaign.status}
              </Text>

              <Box mt="lg" variant="grey10" p="lg" style={{ borderRadius: 12 }}>
                <form onSubmit={saveCampaign}>
                  <Label>Название</Label>
                  <Input width={1} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />

                  <Label mt="md">Платформа</Label>
                  <Select
                    options={PLATFORMS}
                    value={pickOption(PLATFORMS, edit.platform)}
                    onChange={(v) => setEdit({ ...edit, platform: v?.value || 'OTHER' })}
                  />

                  <Label mt="md">Статус</Label>
                  <Select
                    options={STATUSES.filter((s) => s.value !== 'ARCHIVED')}
                    value={pickOption(STATUSES, edit.status)}
                    onChange={(v) => setEdit({ ...edit, status: v?.value || 'DRAFT' })}
                  />

                  <Label mt="md">Цель (что оптимизируем)</Label>
                  <TextArea
                    width={1}
                    value={edit.objective}
                    onChange={(e) => setEdit({ ...edit, objective: e.target.value })}
                    placeholder="Напр. Регистрации в Adventura"
                  />
                  <FieldHint>Свободный текст для команды. На метрики не влияет — влияет трекинг по ссылкам вариантов.</FieldHint>

                  <Label mt="md">Описание</Label>
                  <TextArea width={1} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />

                  <Box mt="md" display="grid" style={{ gridTemplateColumns: '1fr 120px', gap: 12 }}>
                    <Box>
                      <Label>Плановый бюджет</Label>
                      <Input width={1} value={edit.plannedBudget} onChange={(e) => setEdit({ ...edit, plannedBudget: e.target.value })} placeholder="50000" />
                    </Box>
                    <Box>
                      <Label>Валюта</Label>
                      <Input width={1} value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value })} />
                    </Box>
                  </Box>

                  <Label mt="md">ID во внешней рекламной системе</Label>
                  <Input
                    width={1}
                    value={edit.externalCampaignId}
                    onChange={(e) => setEdit({ ...edit, externalCampaignId: e.target.value })}
                    placeholder="Номер кампании в Директе / Ads Manager"
                  />

                  <Box mt="md" display="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Box>
                      <Label>Старт</Label>
                      <Input type="date" width={1} value={edit.startsAt} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })} />
                    </Box>
                    <Box>
                      <Label>Конец</Label>
                      <Input type="date" width={1} value={edit.endsAt} onChange={(e) => setEdit({ ...edit, endsAt: e.target.value })} />
                    </Box>
                  </Box>

                  <Box mt="lg" display="flex" style={{ gap: 8 }}>
                    <Button disabled={busy} variant="primary" type="submit">
                      Сохранить
                    </Button>
                    <Button
                      disabled={busy}
                      variant="danger"
                      type="button"
                      onClick={() => post({ action: 'archiveCampaign', id: campaign.id })}>
                      В архив
                    </Button>
                  </Box>
                </form>
              </Box>

              <Box mt="xl" display="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24 }}>
                <Box>
                  <Header.H4>Варианты ссылок</Header.H4>
                  <FieldHint>Один креатив / аудитория = один вариант. У каждого свой URL с UTM.</FieldHint>
                  {(campaign.variants ?? []).length === 0 && <Text mt="md" color="grey60">Пока нет — создай справа.</Text>}
                  {(campaign.variants ?? []).map((v) => {
                    const landingWarning =
                      v.landing?.status !== 'PUBLISHED'
                        ? `Лендинг не опубликован (${v.landing?.status}) — ссылка не сгенерируется`
                        : null;
                    return (
                      <Box key={v.id} mt="md" p="lg" variant="grey10" style={{ borderRadius: 12 }}>
                        <Text fontWeight="bold">{v.name}</Text>
                        <Text color="grey60">
                          /l/{v.landing?.slug} · {v.isActive ? 'активен' : 'выкл'}
                        </Text>
                        <Text mt="sm" color="grey60" style={{ fontSize: 12 }}>
                          utm: {v.utmSource} / {v.utmMedium} / {v.utmCampaign}
                          {v.utmContent ? ` / ${v.utmContent}` : ''}
                        </Text>
                        {landingWarning && <MessageBox mt="sm" message={landingWarning} variant="warning" />}
                        <Box mt="sm" display="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <Button size="sm" disabled={busy} onClick={() => loadVariantUrl(v.id)}>
                            Показать ссылку и QR
                          </Button>
                          {variantUrl?.variantId === v.id && variantUrl?.url && (
                            <Button size="sm" type="button" onClick={copyVariantUrl}>
                              Скопировать URL
                            </Button>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>

                <Box>
                  <Header.H4>Новый вариант</Header.H4>
                  <FieldHint>Заполни лендинг, понятное имя варианта и три обязательных UTM. Остальное — по необходимости.</FieldHint>
                  <form onSubmit={createVariant}>
                    <Label mt="md">Лендинг</Label>
                    <Select
                      options={landingOptions}
                      value={pickOption(landingOptions, variantLandingId)}
                      onChange={(v) => setVariantLandingId(v?.value || '')}
                      placeholder="Куда ведём трафик"
                    />
                    <FieldHint>Только опубликованный лендинг даст рабочую ссылку.</FieldHint>

                    <Label mt="md">Название варианта</Label>
                    <Input width={1} value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder="Креатив A · 18–24" required />

                    <Box mt="md" display="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => {
                          applyPlatformUtm(campaign.platform);
                          setUtmCampaign(slugify(campaign.name));
                        }}>
                        Подставить UTM с платформы
                      </Button>
                    </Box>

                    <Label mt="md">utm_source — источник</Label>
                    <Input width={1} value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="telegram" required />
                    <FieldHint>Откуда клик: yandex, telegram, tiktok…</FieldHint>

                    <Label mt="md">utm_medium — канал</Label>
                    <Input width={1} value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="cpc / social / referral" required />

                    <Label mt="md">utm_campaign — имя кампании в UTM</Label>
                    <Input width={1} value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="tg_april_regs" required />

                    <Label mt="md">utm_content — креатив (необяз.)</Label>
                    <Input width={1} value={utmContent} onChange={(e) => setUtmContent(e.target.value)} placeholder="banner_blue" />

                    <Label mt="md">utm_term — ключ / аудитория (необяз.)</Label>
                    <Input width={1} value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} placeholder="настольные_игры" />

                    <Button mt="lg" variant="primary" disabled={busy} type="submit">
                      Создать вариант и получить ссылку
                    </Button>
                  </form>
                </Box>
              </Box>

              <Box mt="xl">
                <Header.H4>Готовая ссылка / QR</Header.H4>
                {!variantUrl?.url && <Text color="grey60">Создай вариант или нажми «Показать ссылку и QR» у уже созданного.</Text>}
                {variantUrl?.url && (
                  <Box mt="md" display="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 200px', gap: 16, alignItems: 'start' }}>
                    <Box>
                      <Label>Эту ссылку вставляй в рекламу</Label>
                      <Input width={1} value={variantUrl.url} readOnly />
                      <FieldHint>Внутри уже UTM + adv_variant — по ним строится аналитика.</FieldHint>
                      <Button mt="sm" size="sm" type="button" onClick={copyVariantUrl}>Скопировать ссылку</Button>
                    </Box>
                    <Box>
                      <Label>QR</Label>
                      {qrUrl && (
                        <img
                          alt="QR"
                          src={qrUrl}
                          style={{ width: 180, height: 180, borderRadius: 12, border: '1px solid #E4E7EC' }}
                        />
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

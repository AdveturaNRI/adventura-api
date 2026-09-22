import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Box, Button, Header, Input, Label, MessageBox, Select, Text } from '@adminjs/design-system';

const api = new ApiClient();
const PAGE_NAME = 'marketingAnalytics';

const PLATFORMS = [
  { value: '', label: 'Все платформы' },
  { value: 'YANDEX_DIRECT', label: 'Яндекс Директ' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'OTHER', label: 'Другое' },
];

const FUNNEL_LABELS = {
  LANDING_VIEW: { title: 'Просмотр лендинга', hint: 'Открыли /l/…' },
  CTA_CLICK: { title: 'Клик по CTA', hint: 'Нажали кнопку на лендинге' },
  REGISTRATION_STARTED: { title: 'Начали регистрацию', hint: 'Зашли на экран регистрации' },
  REGISTRATION_COMPLETED: { title: 'Зарегистрировались', hint: 'Аккаунт создан' },
  PROFILE_CREATED: { title: 'Заполнили профиль', hint: 'Анкета / профиль готов' },
  GAME_PUBLISHED: { title: 'Опубликовали игру', hint: 'Создали игровую сессию' },
  APPLICATION_SENT: { title: 'Отправили заявку', hint: 'Заявка в игру' },
  APPLICATION_APPROVED: { title: 'Заявку приняли', hint: 'Одобрение организатором' },
  MATCH_COMPLETED: { title: 'Сыграли матч', hint: 'Игра состоялась' },
};

function pickOption(options, value) {
  const key = value == null ? '' : String(value);
  return options.find((o) => o.value === key) ?? options[0] ?? null;
}

function toDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function fromDateInput(dateStr, endOfDay = false) {
  if (!dateStr) return '';
  return endOfDay ? `${dateStr}T23:59:59.999Z` : `${dateStr}T00:00:00.000Z`;
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('ru-RU');
}

function MetricCard({ title, value, hint }) {
  return (
    <Box p="lg" variant="grey10" style={{ borderRadius: 12, minHeight: 96 }}>
      <Text color="grey60" style={{ fontSize: 12 }}>{title}</Text>
      <Text mt="sm" fontWeight="bold" style={{ fontSize: 22 }}>{value}</Text>
      {hint ? (
        <Text mt="sm" color="grey60" style={{ fontSize: 12, lineHeight: 1.35 }}>{hint}</Text>
      ) : null}
    </Box>
  );
}

export default function MarketingAnalyticsAdmin() {
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [landings, setLandings] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [platform, setPlatform] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [landingId, setLandingId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [overview, setOverview] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [detail, setDetail] = useState(null);
  const [variants, setVariants] = useState([]);

  const applyPayload = (p) => {
    setCampaigns(p.campaigns ?? []);
    setLandings(p.landings ?? []);
    if (p.filters) {
      setFromDate(toDateInput(p.filters.from));
      setToDate(toDateInput(p.filters.to));
      setPlatform(p.filters.platform || '');
      setCampaignId(p.filters.campaignId || '');
      setLandingId(p.filters.landingId || '');
      setVariantId(p.filters.variantId || '');
    }
    if (p.overview) setOverview(p.overview);
    if (p.funnel) setFunnel(p.funnel);
    if (p.timeseries) setTimeseries(p.timeseries);
    if (p.detail) {
      setDetail(p.detail);
      setVariants((p.detail.variants ?? []).map((row) => row.variant));
    }
    if (p.notice) setNotice(p.notice);
  };

  const load = useCallback(async () => {
    const r = await api.getPage({ pageName: PAGE_NAME });
    applyPayload(r.data ?? r);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const campaignOptions = useMemo(
    () => [
      { value: '', label: 'Все кампании' },
      ...(campaigns ?? []).map((c) => ({
        value: c.id,
        label: `${c.name} · ${c.platform}`,
      })),
    ],
    [campaigns],
  );

  const landingOptions = useMemo(
    () => [
      { value: '', label: 'Все лендинги' },
      ...(landings ?? []).map((l) => ({
        value: l.id,
        label: `${l.name} · /l/${l.slug}`,
      })),
    ],
    [landings],
  );

  const variantOptions = useMemo(() => {
    const fromDetail = variants ?? [];
    const fromCampaign = detail?.campaign?.variants ?? [];
    const list = fromDetail.length ? fromDetail : fromCampaign;
    return [
      { value: '', label: 'Все варианты' },
      ...list.map((v) => ({ value: v.id, label: v.name || v.id })),
    ];
  }, [variants, detail]);

  const filterPayload = () => ({
    from: fromDateInput(fromDate, false),
    to: fromDateInput(toDate, true),
    platform,
    campaignId,
    landingId,
    variantId,
  });

  const post = async (payload) => {
    setBusy(true);
    const data = new FormData();
    Object.entries(payload).forEach(([k, v]) => data.append(k, v ?? ''));
    const r = await api.getPage({ pageName: PAGE_NAME, method: 'post', data });
    const p = r.data ?? r;
    applyPayload(p);
    setBusy(false);
    return p;
  };

  const query = async () => {
    setDetail(null);
    await post({ action: 'query', ...filterPayload() });
  };

  const openCampaignDetail = async () => {
    if (!campaignId) {
      setNotice({ type: 'error', message: 'Сначала выбери кампанию в фильтре' });
      return;
    }
    await post({ action: 'campaignDetail', ...filterPayload() });
  };

  const funnelSteps = useMemo(() => funnel?.steps ?? [], [funnel]);
  const maxVisitors = Math.max(1, ...funnelSteps.map((s) => s.visitors || 0));

  const setPreset = (days) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    setFromDate(toDateInput(from.toISOString()));
    setToDate(toDateInput(to.toISOString()));
  };

  return (
    <Box variant="grey20" padding="xxl">
      <Header.H2>Маркетинг · Аналитика</Header.H2>

      <Box mt="md" p="lg" variant="white" style={{ borderRadius: 12, maxWidth: 960 }}>
        <Text fontWeight="bold">Что здесь считается</Text>
        <Text mt="sm" color="grey60" style={{ lineHeight: 1.55 }}>
          Пользователь открывает ссылку варианта кампании (с UTM) → мы пишем касание и события воронки:
          просмотр лендинга → клик CTA → регистрация → заявка → матч.
          Расход (Spend) берётся из расходов кампании, если их завели; CPC/CPR/CPA = расход ÷ событие.
          Без кликов по размеченным ссылкам цифры будут нулевые — это нормально.
        </Text>
      </Box>

      {notice && (
        <MessageBox mt="lg" message={notice.message} variant={notice.type === 'error' ? 'danger' : 'success'} />
      )}

      <Box mt="xl" variant="white" p="xl" style={{ borderRadius: 14, maxWidth: 1200 }}>
        <Header.H4>Период и фильтры</Header.H4>
        <Box mt="sm" display="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={() => setPreset(7)}>7 дней</Button>
          <Button size="sm" onClick={() => setPreset(30)}>30 дней</Button>
          <Button size="sm" onClick={() => setPreset(90)}>90 дней</Button>
        </Box>

        <Box mt="lg" display="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
          <Box>
            <Label>С даты</Label>
            <Input type="date" width={1} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Box>
          <Box>
            <Label>По дату</Label>
            <Input type="date" width={1} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Box>
          <Box>
            <Label>Платформа</Label>
            <Select
              options={PLATFORMS}
              value={pickOption(PLATFORMS, platform)}
              onChange={(v) => setPlatform(v?.value || '')}
            />
          </Box>
          <Box>
            <Label>Кампания</Label>
            <Select
              options={campaignOptions}
              value={pickOption(campaignOptions, campaignId)}
              onChange={(v) => {
                setCampaignId(v?.value || '');
                setVariantId('');
                setDetail(null);
              }}
            />
          </Box>
          <Box>
            <Label>Лендинг</Label>
            <Select
              options={landingOptions}
              value={pickOption(landingOptions, landingId)}
              onChange={(v) => setLandingId(v?.value || '')}
            />
          </Box>
          <Box>
            <Label>Вариант ссылки</Label>
            <Select
              options={variantOptions}
              value={pickOption(variantOptions, variantId)}
              onChange={(v) => setVariantId(v?.value || '')}
            />
            <Text mt="sm" color="grey60" style={{ fontSize: 12 }}>
              Список вариантов появится после «Разбить по вариантам» для выбранной кампании.
            </Text>
          </Box>
        </Box>

        <Box mt="lg" display="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" disabled={busy} onClick={query}>
            Посчитать
          </Button>
          <Button disabled={busy || !campaignId} onClick={openCampaignDetail}>
            Разбить по вариантам кампании
          </Button>
        </Box>
      </Box>

      {overview && (
        <Box mt="xl" variant="white" p="xl" style={{ borderRadius: 14, maxWidth: 1200 }}>
          <Header.H4>Сводка</Header.H4>
          <Text color="grey60" style={{ fontSize: 12 }}>
            {toDateInput(overview.from)} → {toDateInput(overview.to)}
          </Text>
          <Box mt="lg" display="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <MetricCard title="Расход" value={fmtMoney(overview.spendRub)} hint="Сумма расходов кампаний за период" />
            <MetricCard title="Просмотры" value={fmtNum(overview.views)} hint="Открытия лендинга" />
            <MetricCard title="Клики CTA" value={fmtNum(overview.clicks)} hint="Нажатия кнопок на лендинге" />
            <MetricCard title="Регистрации" value={fmtNum(overview.registrations)} hint="Завершённые регистрации" />
            <MetricCard title="Заявки" value={fmtNum(overview.applicationsSent)} hint="Отправленные заявки в игры" />
            <MetricCard title="Одобрено" value={fmtNum(overview.applicationsApproved)} hint="Принятые заявки" />
            <MetricCard title="Матчи" value={fmtNum(overview.matches)} hint="Сыгранные игры" />
            <MetricCard title="CPC" value={fmtMoney(overview.cpc)} hint="Цена клика = расход ÷ клики (или просмотры)" />
            <MetricCard title="CPR" value={fmtMoney(overview.cpr)} hint="Цена регистрации = расход ÷ регистрации" />
            <MetricCard title="CPA заявка" value={fmtMoney(overview.cpaApplication)} hint="Цена заявки" />
            <MetricCard title="CPA одобрение" value={fmtMoney(overview.cpaApproved)} hint="Цена одобренной заявки" />
          </Box>
        </Box>
      )}

      {funnel && (
        <Box mt="xl" variant="white" p="xl" style={{ borderRadius: 14, maxWidth: 1200 }}>
          <Header.H4>Воронка (уники)</Header.H4>
          <Text color="grey60" style={{ fontSize: 12, lineHeight: 1.4 }}>
            Считаем уникальных людей на каждом шаге (userId или anonymousId). Чем ниже шаг — тем ближе к ценности продукта.
          </Text>
          {funnelSteps.map((s) => {
            const meta = FUNNEL_LABELS[s.type] || { title: s.type, hint: '' };
            const pct = Math.round(((s.visitors || 0) / maxVisitors) * 100);
            return (
              <Box key={s.type} mt="md">
                <Box display="flex" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <Box>
                    <Text fontWeight="bold">{meta.title}</Text>
                    <Text color="grey60" style={{ fontSize: 12 }}>{meta.hint}</Text>
                  </Box>
                  <Text fontWeight="bold">{fmtNum(s.visitors)}</Text>
                </Box>
                <Box mt="sm" style={{ height: 8, borderRadius: 999, background: '#EEF2F6', overflow: 'hidden' }}>
                  <Box style={{ width: `${pct}%`, height: '100%', background: '#157AFE' }} />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {timeseries && (
        <Box mt="xl" variant="white" p="xl" style={{ borderRadius: 14, maxWidth: 1200 }}>
          <Header.H4>По дням</Header.H4>
          <Text color="grey60" style={{ fontSize: 12 }}>Последние 14 дней из выбранного периода</Text>
          <Box mt="md" style={{ overflowX: 'auto' }}>
            <Box display="grid" style={{ gridTemplateColumns: '100px repeat(5, minmax(70px, 1fr))', gap: 8, minWidth: 560 }}>
              <Text fontWeight="bold" color="grey60">День</Text>
              <Text fontWeight="bold" color="grey60">Расход</Text>
              <Text fontWeight="bold" color="grey60">Просмотры</Text>
              <Text fontWeight="bold" color="grey60">Клики</Text>
              <Text fontWeight="bold" color="grey60">Реги</Text>
              <Text fontWeight="bold" color="grey60">CPC</Text>
              {(timeseries.points ?? []).slice(-14).map((p) => (
                <React.Fragment key={p.t}>
                  <Text>{p.t}</Text>
                  <Text>{fmtMoney(p.spendRub)}</Text>
                  <Text>{fmtNum(p.views)}</Text>
                  <Text>{fmtNum(p.clicks)}</Text>
                  <Text>{fmtNum(p.registrations)}</Text>
                  <Text>{fmtMoney(p.cpc)}</Text>
                </React.Fragment>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {detail && (
        <Box mt="xl" variant="white" p="xl" style={{ borderRadius: 14, maxWidth: 1200 }}>
          <Header.H4>Кампания: {detail.campaign?.name}</Header.H4>
          <Text color="grey60">Сравнение вариантов ссылок за тот же период</Text>
          {(detail.variants ?? []).map((row) => (
            <Box key={row.variant.id} mt="md" p="lg" variant="grey10" style={{ borderRadius: 12 }}>
              <Text fontWeight="bold">{row.variant.name}</Text>
              <Text color="grey60">
                /l/{row.variant.landing?.slug} · {row.variant.isActive ? 'активен' : 'выкл'}
              </Text>
              <Box mt="sm" display="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                <Box><Text color="grey60" style={{ fontSize: 12 }}>Расход</Text><Text fontWeight="bold">{fmtMoney(row.overview.spendRub)}</Text></Box>
                <Box><Text color="grey60" style={{ fontSize: 12 }}>Клики</Text><Text fontWeight="bold">{fmtNum(row.overview.clicks)}</Text></Box>
                <Box><Text color="grey60" style={{ fontSize: 12 }}>Реги</Text><Text fontWeight="bold">{fmtNum(row.overview.registrations)}</Text></Box>
                <Box><Text color="grey60" style={{ fontSize: 12 }}>CPC</Text><Text fontWeight="bold">{fmtMoney(row.overview.cpc)}</Text></Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

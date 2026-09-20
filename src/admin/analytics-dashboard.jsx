import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient } from 'adminjs';
import { Box, Button, Header, Text } from '@adminjs/design-system';

const api = new ApiClient();

const RANGE_ORDER = ['day', 'week', 'month', 'year', 'all'];

const GROUP_LABELS = {
  platform: 'Платформа',
  views: 'Просмотры',
  transitions: 'Переходы',
  product: 'Продукт',
  funnel: 'Воронка',
  clubs: 'Клубы',
  metrics: 'Метрики',
};

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} с`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin} мин`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours < 48) return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} д ${remHours} ч` : `${days} д`;
}

function formatMetricValue(value, format = 'count') {
  if (value == null || !Number.isFinite(value)) return '—';
  switch (format) {
    case 'percent01':
      return `${(value * 100).toFixed(1)}%`;
    case 'percent100':
      return `${value.toFixed(1)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'duration_ms':
      return formatDurationMs(value);
    case 'count':
    default:
      return Number.isInteger(value) ? String(value) : String(Math.round(value));
  }
}

function aggregateSeriesTotal(series, metaById) {
  const meta = metaById[series.id] ?? {};
  const gauge = Boolean(meta.gauge ?? series.gauge);
  const format = meta.valueFormat ?? series.valueFormat ?? 'count';
  const points = series.points ?? [];
  const values = points
    .map((p) => p.v)
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) {
    return { raw: null, display: '—', hint: gauge ? 'снимок' : 'сумма' };
  }
  const raw = gauge ? values[values.length - 1] : values.reduce((a, b) => a + b, 0);
  return {
    raw,
    display: formatMetricValue(raw, format),
    hint: gauge ? 'на конец периода' : 'сумма за период',
  };
}

function MetricCard({ label, value, hint, color }) {
  return (
    <Box
      variant="white"
      boxShadow="card"
      padding="xl"
      style={{ minWidth: 160, flex: '1 1 160px', borderTop: `3px solid ${color || '#64748b'}` }}
    >
      <Text fontSize={12} color="grey60" marginBottom="sm">
        {label}
      </Text>
      <Header.H3 style={{ margin: 0 }}>{value ?? '—'}</Header.H3>
      {hint ? (
        <Text fontSize={11} color="grey60" marginTop="sm">
          {hint}
        </Text>
      ) : null}
    </Box>
  );
}

function formatAxisLabel(t, bucket) {
  if (!t) return '';
  if (bucket === 'hour') {
    const d = new Date(t);
    return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
  }
  if (bucket === 'month') {
    const [y, m] = t.split('-');
    return `${m}.${y.slice(2)}`;
  }
  if (bucket === 'week') {
    const d = new Date(`${t}T00:00:00.000Z`);
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  // day
  const [, m, d] = t.split('-');
  return `${d}.${m}`;
}

function SeriesChip({ series, on, onToggle }) {
  const [tip, setTip] = useState(null);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTip({
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      }}
      onMouseLeave={() => setTip(null)}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${series.label}. ${series.description ?? ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 999,
          border: on ? `1.5px solid ${series.color}` : '1.5px solid #e5e7eb',
          background: on ? `${series.color}14` : '#f9fafb',
          color: on ? '#111827' : '#6b7280',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: series.color,
            opacity: on ? 1 : 0.35,
          }}
        />
        {series.label}
      </button>
      {tip && series.description ? (
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            left: tip.x,
            top: tip.y - 10,
            transform: 'translate(-50%, -100%)',
            zIndex: 10000,
            maxWidth: 320,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#111827',
            color: '#f9fafb',
            fontSize: 12,
            lineHeight: 1.45,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
            whiteSpace: 'normal',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 4, color: series.color }}>
            {series.label}
          </strong>
          {series.description}
        </span>
      ) : null}
    </span>
  );
}

function LineChart({ series, bucket, height = 320 }) {
  const [hover, setHover] = useState(null);
  const width = 920;
  const pad = { top: 24, right: 20, bottom: 36, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const labels = series[0]?.points?.map((p) => p.t) ?? [];
  const maxY = Math.max(
    1,
    ...series.flatMap((s) =>
      s.points.map((p) => p.v).filter((v) => typeof v === 'number' && Number.isFinite(v)),
    ),
  );
  const niceMax = (() => {
    const exp = Math.pow(10, Math.floor(Math.log10(maxY)));
    const n = maxY / exp;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * exp;
  })();

  const xAt = (i) =>
    labels.length <= 1
      ? pad.left + innerW / 2
      : pad.left + (i / (labels.length - 1)) * innerW;
  const yAt = (v) => pad.top + innerH - (v / niceMax) * innerH;

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: pad.top + innerH * (1 - f),
    label: Math.round(niceMax * f),
  }));

  const labelStep = Math.max(1, Math.ceil(labels.length / 8));

  return (
    <Box style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', maxWidth: '100%' }}
        onMouseLeave={() => setHover(null)}
      >
        <rect x="0" y="0" width={width} height={height} fill="#fff" rx="8" />

        {gridYs.map((g) => (
          <g key={g.label}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={g.y}
              y2={g.y}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
            <text
              x={pad.left - 8}
              y={g.y + 4}
              textAnchor="end"
              fontSize="11"
              fill="#9ca3af"
            >
              {g.label}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const parts = [];
          let started = false;
          s.points.forEach((p, i) => {
            if (typeof p.v !== 'number' || !Number.isFinite(p.v)) {
              started = false;
              return;
            }
            parts.push(`${started ? 'L' : 'M'} ${xAt(i)} ${yAt(p.v)}`);
            started = true;
          });
          const d = parts.join(' ');
          if (!d) return null;
          return (
            <path
              key={s.id}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {series.map((s) =>
          s.points.map((p, i) =>
            typeof p.v === 'number' && Number.isFinite(p.v) ? (
              <circle
                key={`${s.id}-${p.t}`}
                cx={xAt(i)}
                cy={yAt(p.v)}
                r={labels.length > 40 ? 2 : 3.5}
                fill={s.color}
              />
            ) : null,
          ),
        )}

        {labels.map((t, i) =>
          i % labelStep === 0 || i === labels.length - 1 ? (
            <text
              key={t}
              x={xAt(i)}
              y={height - 12}
              textAnchor="middle"
              fontSize="11"
              fill="#6b7280"
            >
              {formatAxisLabel(t, bucket)}
            </text>
          ) : null,
        )}

        {labels.map((t, i) => (
          <rect
            key={`hit-${t}`}
            x={xAt(i) - innerW / Math.max(labels.length, 1) / 2}
            y={pad.top}
            width={Math.max(innerW / Math.max(labels.length, 1), 8)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {hover != null && labels[hover] != null && (
          <g>
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke="#94a3b8"
              strokeDasharray="4 4"
            />
            <rect
              x={Math.min(xAt(hover) + 10, width - 220)}
              y={pad.top + 8}
              width="210"
              height={24 + series.length * 18}
              rx="6"
              fill="#111827"
              opacity="0.92"
            />
            <text
              x={Math.min(xAt(hover) + 20, width - 210)}
              y={pad.top + 26}
              fontSize="11"
              fill="#e5e7eb"
            >
              {formatAxisLabel(labels[hover], bucket)}
            </text>
            {series.map((s, idx) => {
              const raw = s.points[hover]?.v;
              const formatted =
                typeof raw === 'number' && Number.isFinite(raw)
                  ? formatMetricValue(raw, s.valueFormat ?? 'count')
                  : '—';
              return (
                <text
                  key={s.id}
                  x={Math.min(xAt(hover) + 20, width - 210)}
                  y={pad.top + 44 + idx * 18}
                  fontSize="11"
                  fill={s.color}
                >
                  {s.label}: {formatted}
                </text>
              );
            })}
          </g>
        )}
      </svg>
    </Box>
  );
}

const AnalyticsDashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('week');
  const [enabled, setEnabled] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api.getDashboard();
        const payload = response.data ?? response;
        if (cancelled) return;
        setData(payload);
        const initial = {};
        for (const meta of payload.seriesMeta ?? []) {
          initial[meta.id] = Boolean(meta.defaultOn);
        }
        setEnabled(initial);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось загрузить сводку');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metaById = useMemo(() => {
    const map = {};
    for (const meta of data?.seriesMeta ?? []) {
      map[meta.id] = meta;
    }
    return map;
  }, [data]);

  const current = data?.ranges?.[range];

  const visibleSeries = useMemo(() => {
    if (!current?.series) return [];
    return current.series.filter((s) => enabled[s.id]);
  }, [current, enabled]);

  const totals = useMemo(() => {
    return visibleSeries.map((s) => {
      const aggregated = aggregateSeriesTotal(s, metaById);
      return {
        id: s.id,
        label: s.label,
        color: s.color,
        display: aggregated.display,
        hint: aggregated.hint,
      };
    });
  }, [visibleSeries, metaById]);

  const toggle = (id) => {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setGroup = (group, on) => {
    setEnabled((prev) => {
      const next = { ...prev };
      for (const meta of data?.seriesMeta ?? []) {
        if (meta.group === group) next[meta.id] = on;
      }
      return next;
    });
  };

  if (error) {
    return (
      <Box variant="grey20" padding="xxl">
        <Text color="error">{error}</Text>
      </Box>
    );
  }

  if (!data || !current) {
    return (
      <Box variant="grey20" padding="xxl">
        <Text>Загрузка аналитики…</Text>
      </Box>
    );
  }

  const groups = ['platform', 'views', 'transitions', 'product', 'funnel', 'clubs', 'metrics'];

  const kpis = data.kpis ?? {};
  const onlineHint = kpis.onlineWindowMinutes
    ? `lastSeen ≤ ${kpis.onlineWindowMinutes} мин`
    : 'lastSeen недавно';

  return (
    <Box variant="grey20" padding="xxl">
      <Header.H2 marginBottom="lg">Аналитика Adventura</Header.H2>
      <Text color="grey60" marginBottom="xl">
        Карточки сверху — актуальное состояние БД сейчас. Числа над графиком за
        период: для снимков (пользователи, анкеты, DAU/WAU/MAU, %) берётся
        последнее значение; для событий — сумма. Просмотры — карточка видна ≥3с.
        Переходы — открытие деталки.
      </Text>

      <Box display="flex" flexWrap="wrap" style={{ gap: 16 }} marginBottom="xl">
        <MetricCard
          label="Пользователи"
          value={kpis.usersTotal}
          hint="Без гостей · сейчас"
          color="#0ea5e9"
        />
        <MetricCard
          label="Анкеты"
          value={kpis.profilesActive}
          hint="Готовы к ленте странников"
          color="#8b5cf6"
        />
        <MetricCard
          label="Онлайн"
          value={kpis.usersOnline}
          hint={onlineHint}
          color="#22c55e"
        />
      </Box>

      <Box display="flex" flexWrap="wrap" style={{ gap: 8 }} marginBottom="xl">
        {RANGE_ORDER.map((key) => {
          const item = data.ranges[key];
          const active = key === range;
          return (
            <Button
              key={key}
              size="sm"
              variant={active ? 'primary' : 'text'}
              onClick={() => setRange(key)}
            >
              {item?.label ?? key}
            </Button>
          );
        })}
      </Box>

      <Box
        variant="white"
        boxShadow="card"
        padding="xl"
        marginBottom="xl"
        style={{ borderRadius: 12 }}
      >
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          marginBottom="lg"
          flexWrap="wrap"
          style={{ gap: 12 }}
        >
          <Header.H3 style={{ margin: 0 }}>
            {current.label}
            <Text as="span" color="grey60" ml="default" fontSize={14}>
              · бакет: {current.bucket}
            </Text>
          </Header.H3>
          <Box display="flex" flexWrap="wrap" style={{ gap: 12 }}>
            {totals.map((t) => (
              <Text
                key={t.id}
                fontSize={13}
                style={{ color: t.color }}
                title={t.hint}
              >
                {t.label}: <strong>{t.display}</strong>
              </Text>
            ))}
          </Box>
        </Box>

        {visibleSeries.length === 0 ? (
          <Text color="grey60">Включи хотя бы одну линию справа/ниже.</Text>
        ) : (
          <LineChart series={visibleSeries} bucket={current.bucket} />
        )}
      </Box>

      <Box
        variant="white"
        boxShadow="card"
        padding="xl"
        style={{ borderRadius: 12 }}
      >
        <Header.H4 marginBottom="lg">Линии на графике</Header.H4>
        {groups.map((group) => {
          const items = (data.seriesMeta ?? []).filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <Box key={group} marginBottom="xl">
              <Box
                display="flex"
                alignItems="center"
                style={{ gap: 8 }}
                marginBottom="default"
              >
                <Text fontWeight="bold">{GROUP_LABELS[group] ?? group}</Text>
                <Button size="sm" variant="text" onClick={() => setGroup(group, true)}>
                  все
                </Button>
                <Button size="sm" variant="text" onClick={() => setGroup(group, false)}>
                  сброс
                </Button>
              </Box>
              <Box display="flex" flexWrap="wrap" style={{ gap: 10 }}>
                {items.map((s) => (
                  <SeriesChip
                    key={s.id}
                    series={s}
                    on={Boolean(enabled[s.id])}
                    onToggle={() => toggle(s.id)}
                  />
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default AnalyticsDashboard;

/**
 * Мок: создаёт N опубликованных новостных объявлений для проверки слайдера.
 * После создания пингует уже запущенный API, чтобы клиенты подтянули весь unread-список.
 *
 *   npm run announcements:seed
 *   npm run announcements:seed -- 10
 *   npm run announcements:seed -- 5 --draft
 */
import { PrismaClient, SiteAnnouncementStatus } from '@prisma/client';

import { DEFAULT_ANNOUNCEMENT_THEME } from '../src/announcements/announcement-theme';

const prisma = new PrismaClient();

const TITLES = [
  'Обновление профиля',
  'Новые игровые системы',
  'Голосовые звонки',
  'Клубы рядом с тобой',
  'Чат и реакции',
  'Авторы и посты',
  'Награды и рамки',
  'Пуш-уведомления',
  'Справочник по правилам',
  'Техработы завершены',
];

const BODIES = [
  'Загляни в настройки — там пару удобных мелочей.',
  'Добавили системы, которые чаще всего просили.',
  'Можно созвониться прямо из чата группы.',
  'На карте видны площадки и расписание.',
  'Жми ❤️ на сообщения — собеседник увидит.',
  'Публикуй материал и собирай отклики.',
  'За активность открываются косметические штуки.',
  'Включи уведомления, чтобы не пропускать отклики.',
  'Краткие правила систем — без простыней текста.',
  'Сервис снова в строю, спасибо за терпение.',
];

async function notifyRunningApi(id: string, publicationVersion: number) {
  const origin = (
    process.env.API_ORIGIN ||
    process.env.PUBLIC_API_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const adminKey =
    process.env.ADMIN_API_KEY?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    '';

  if (!adminKey) {
    console.log(
      'Realtime-пинг пропущен: нет ADMIN_API_KEY / ADMIN_PASSWORD в env.',
    );
    return;
  }

  try {
    const response = await fetch(`${origin}/api/announcements/dev/notify-published`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({ id, publicationVersion }),
    });
    if (!response.ok) {
      const text = await response.text();
      console.log(
        `Realtime-пинг не удался (${response.status}): ${text.slice(0, 200)}`,
      );
      console.log('Обнови клиент вручную — подтянется весь unread-список.');
      return;
    }
    console.log(
      `Realtime-пинг ok → клиенты обновят модалку полным unread-списком (${id}).`,
    );
  } catch (error) {
    console.log(
      `Realtime-пинг не достучался до ${origin} (API запущен?):`,
      error instanceof Error ? error.message : error,
    );
    console.log('Обнови клиент вручную — подтянется весь unread-список.');
  }
}

async function main() {
  const countArg = process.argv.find((arg) => /^\d+$/.test(arg));
  const count = Math.min(50, Math.max(1, Number(countArg ?? 10)));
  const asDraft = process.argv.includes('--draft');
  const status = asDraft
    ? SiteAnnouncementStatus.DRAFT
    : SiteAnnouncementStatus.PUBLISHED;

  const now = Date.now();
  const created = [];

  for (let i = 0; i < count; i += 1) {
    const n = i + 1;
    const title = TITLES[i % TITLES.length] ?? `Новость ${n}`;
    const body = BODIES[i % BODIES.length] ?? `Текст объявления №${n}`;
    const publishedAt = new Date(now - (count - n) * 60_000);

    const row = await prisma.siteAnnouncement.create({
      data: {
        internalName: `mock-${n}-${Date.now()}`,
        title: `${title} (#${n})`,
        body: `<p>${body}</p>`,
        actionLabel: n % 2 === 0 ? 'Перейти' : null,
        actionUrl: n % 2 === 0 ? '/games' : null,
        status,
        publishedAt: asDraft ? null : publishedAt,
        publicationVersion: asDraft ? 0 : 1,
        theme: {
          ...DEFAULT_ANNOUNCEMENT_THEME,
          imageFocusX: 40 + (i % 5) * 5,
          imageFocusY: 35 + (i % 4) * 8,
        },
      },
    });
    created.push(row);
  }

  console.log(
    `Создано ${created.length} объявлений (${asDraft ? 'черновики' : 'опубликовано'}).`,
  );
  for (const row of created) {
    console.log(`  - ${row.id}  ${row.title}`);
  }

  if (!asDraft && created.length > 0) {
    const newest = created[created.length - 1]!;
    await notifyRunningApi(newest.id, newest.publicationVersion);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

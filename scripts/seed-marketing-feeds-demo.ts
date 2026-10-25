/**
 * Local demo data for marketing landing feeds (games / wanderers / clubs / publications).
 * Usage: npx ts-node -r tsconfig-paths/register scripts/seed-marketing-feeds-demo.ts
 */
import { createHash, randomBytes } from 'crypto';

import { GameKind, GameStatus, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'DemoPass123!';
const TAG = 'marketing-demo';

const WEEK_SCHEDULE = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  day,
  closed: day === 1,
  open: day === 1 ? null : '12:00',
  close: day === 1 ? null : '23:00',
}));

function hashPlaceholder(): string {
  return createHash('sha256').update(randomBytes(8)).digest('hex').slice(0, 16);
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const moscow = await prisma.city.findFirst({
    where: { name: 'Москва' },
    select: { id: true },
  });
  const spb = await prisma.city.findFirst({
    where: { name: 'Санкт-Петербург' },
    select: { id: true },
  });

  const wandererSpecs = [
    {
      email: 'demo.wanderer1@adventura.local',
      nickname: 'ЛунныйСледопыт',
      about: 'Ищу камерные истории и добрых мастеров.',
      systems: ['D&D 5e', 'Blades in the Dark'],
      roles: ['player'],
    },
    {
      email: 'demo.wanderer2@adventura.local',
      nickname: 'МастерТени',
      about: 'Веду oneshot и короткие кампании по пятницам.',
      systems: ['Pathfinder 2e', 'Call of Cthulhu'],
      roles: ['master'],
    },
    {
      email: 'demo.wanderer3@adventura.local',
      nickname: 'ПесньКубиков',
      about: 'Новичок, хочу первую партию онлайн.',
      systems: ['D&D 5e'],
      roles: ['player'],
    },
    {
      email: 'demo.wanderer4@adventura.local',
      nickname: 'ГородскойБард',
      about: 'Люблю городские приключения и интриги.',
      systems: ['Vampire', 'D&D 5e'],
      roles: ['player', 'master'],
    },
    {
      email: 'demo.wanderer5@adventura.local',
      nickname: 'ХранительКарт',
      about: 'Рисую карты и иногда веду sandbox.',
      systems: ['OSR', 'Mothership'],
      roles: ['master'],
    },
    {
      email: 'demo.wanderer6@adventura.local',
      nickname: 'ИскраВетра',
      about: 'Ищу офлайн в Москве на выходных.',
      systems: ['D&D 5e', 'Fate'],
      roles: ['player'],
    },
  ] as const;

  const owners: { id: string; nickname: string }[] = [];
  for (const spec of wandererSpecs) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        email: spec.email,
        nickname: spec.nickname,
        passwordHash,
        isGuest: false,
        isPublic: true,
        age: 25,
        about: spec.about,
        description: `${spec.about} (${TAG})`,
        systems: [...spec.systems],
        roles: [...spec.roles],
        playsOnline: true,
        cityId: moscow?.id ?? null,
        emailVerifiedAt: new Date(),
        questionnaireStep: 99,
      },
      update: {
        isGuest: false,
        isPublic: true,
        age: 25,
        about: spec.about,
        description: `${spec.about} (${TAG})`,
        systems: [...spec.systems],
        roles: [...spec.roles],
        passwordHash,
      },
      select: { id: true, nickname: true },
    });
    owners.push(user);
  }

  const master = owners[1];
  const systems = [
    { name: 'D&D 5e', normalizedName: 'dnd-5e' },
    { name: 'Pathfinder 2e', normalizedName: 'pf2e' },
    { name: 'Call of Cthulhu', normalizedName: 'coc' },
    { name: 'Blades in the Dark', normalizedName: 'bitd' },
    { name: 'Fate', normalizedName: 'fate' },
    { name: 'OSR', normalizedName: 'osr' },
  ];

  const ugsIds: string[] = [];
  for (const sys of systems) {
    const row = await prisma.userGameSystem.upsert({
      where: {
        userId_normalizedName: {
          userId: master.id,
          normalizedName: sys.normalizedName,
        },
      },
      create: {
        userId: master.id,
        name: sys.name,
        normalizedName: sys.normalizedName,
      },
      update: { name: sys.name },
      select: { id: true },
    });
    ugsIds.push(row.id);
  }

  const gameTitles = [
    ['Туман над Грейвхенджем', 'oneshot ужасов для новичков', true, null as number | null],
    ['Кузница теней', 'кампания интриг в городе гильдий', true, 500],
    ['Пираты Янтарного моря', 'морские приключения на выходных', false, 0],
    ['Архив забытых имён', 'расследование в стиле CoC', true, 300],
    ['Ночной экспресс', 'oneshot в поезде — 4 часа', true, null],
    ['Звёздный форпост', 'научная фантастика, OSR-вайб', true, 0],
  ] as const;

  // Clear previous demo games of this master to keep feed tidy
  await prisma.game.deleteMany({
    where: {
      ownerId: master.id,
      description: { contains: TAG },
    },
  });

  for (let i = 0; i < gameTitles.length; i += 1) {
    const [title, desc, online, price] = gameTitles[i];
    await prisma.game.create({
      data: {
        ownerId: master.id,
        userGameSystemId: ugsIds[i % ugsIds.length],
        title,
        description: `${desc} [${TAG}]`,
        maxPlayers: 5,
        durationHours: 4,
        kind: i % 2 === 0 ? GameKind.ONESHOT : GameKind.CAMPAIGN,
        status: GameStatus.RECRUITING,
        isOnline: online,
        cityId: online ? null : (spb?.id ?? moscow?.id ?? null),
        scheduledAt: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
        priceRub: price,
        beginnersWelcome: i % 2 === 0,
        minAge: 18,
      },
    });
  }

  await prisma.club.deleteMany({
    where: { ownerId: master.id, description: { contains: TAG } },
  });

  const clubs = [
    {
      name: 'Чёрный Котёл',
      description: `Уютный зал с отдельными столами для НРИ. [${TAG}]`,
      address: 'ул. Арбат, 12',
      cityId: moscow?.id,
      lat: 55.752,
      lng: 37.592,
    },
    {
      name: 'Кубик и Перо',
      description: `Клуб с библиотекой систем и вечерними наборами. [${TAG}]`,
      address: 'Невский пр., 48',
      cityId: spb?.id,
      lat: 59.934,
      lng: 30.335,
    },
    {
      name: 'Зал Странников',
      description: `Пространство для oneshot и турниров. [${TAG}]`,
      address: 'ул. Тверская, 7',
      cityId: moscow?.id,
      lat: 55.758,
      lng: 37.613,
    },
  ];

  for (const club of clubs) {
    await prisma.club.create({
      data: {
        ownerId: master.id,
        name: club.name,
        description: club.description,
        address: club.address,
        lat: club.lat,
        lng: club.lng,
        cityId: club.cityId ?? null,
        tablesCount: 6,
        schedule: WEEK_SCHEDULE,
        isPublished: true,
        tags: ['нри', 'демо'],
      },
    });
  }

  // Author profiles + posts for first 3 wanderers
  const postSpecs = [
    {
      title: 'Как провести первую сессию без стресса',
      content:
        '<p>Короткий гайд для новых мастеров: сессионные нули, ожидания и безопасность за столом.</p>',
      category: 'guide',
    },
    {
      title: 'Карта портового города для sandbox',
      content:
        '<p>Делюсь заготовкой кварталов, крючков и слухов для городской кампании.</p>',
      category: 'world',
    },
    {
      title: 'Плейлист для подземелий',
      content:
        '<p>Подборка треков под исследование, бой и передышку — без копирайтных ловушек.</p>',
      category: 'music',
    },
    {
      title: 'NPC недели: трактирщица с секретом',
      content: '<p>Готовый персонаж с мотивами, секретом и тремя крючками для партии.</p>',
      category: 'npc',
    },
    {
      title: 'Чеклист oneshot на 4 часа',
      content: '<p>Тайминг сцен, запасные завязки и как не утонуть в импрове.</p>',
      category: 'guide',
    },
    {
      title: 'Мини-сеттинг: станция на астероиде',
      content: '<p>Локация для sci-fi one-shot с тремя фракциями и сломанным маяком.</p>',
      category: 'world',
    },
  ];

  for (let i = 0; i < Math.min(3, owners.length); i += 1) {
    const owner = owners[i];
    const profile = await prisma.authorProfile.upsert({
      where: { userId: owner.id },
      create: {
        userId: owner.id,
        description: `Авторские материалы ${owner.nickname} [${TAG}]`,
        categories: ['guide', 'world'],
      },
      update: {
        description: `Авторские материалы ${owner.nickname} [${TAG}]`,
      },
    });

    await prisma.authorPost.deleteMany({
      where: {
        authorProfileId: profile.id,
        content: { contains: TAG },
      },
    });

    for (let j = 0; j < 2; j += 1) {
      const spec = postSpecs[i * 2 + j];
      await prisma.authorPost.create({
        data: {
          authorProfileId: profile.id,
          title: spec.title,
          content: `${spec.content}<p>${TAG}</p>`,
          category: spec.category,
          isForSale: false,
        },
      });
    }
  }

  const summary = {
    wanderers: await prisma.user.count({
      where: { isGuest: false, isPublic: true, age: { gte: 18 } },
    }),
    games: await prisma.game.count({ where: { status: GameStatus.RECRUITING } }),
    clubs: await prisma.club.count({ where: { isPublished: true, deletedAt: null } }),
    posts: await prisma.authorPost.count({
      where: { deletedAt: null, isForSale: false },
    }),
    loginHint: {
      email: 'demo.wanderer2@adventura.local',
      password: DEMO_PASSWORD,
      note: hashPlaceholder(),
    },
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

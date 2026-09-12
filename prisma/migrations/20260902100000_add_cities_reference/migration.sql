-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "population" INTEGER NOT NULL DEFAULT 0,
    "geonameId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "cityId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cities_geonameId_key" ON "cities"("geonameId");

-- CreateIndex
CREATE INDEX "cities_name_idx" ON "cities"("name");

-- CreateIndex
CREATE INDEX "cities_countryId_population_idx" ON "cities"("countryId", "population");

-- CreateIndex
CREATE UNIQUE INDEX "cities_countryId_name_region_key" ON "cities"("countryId", "name", "region");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "countries" ("id", "code", "name", "sortOrder") VALUES
('clcountry01', 'RU', 'Россия', 1),
('clcountry02', 'BY', 'Беларусь', 2);

INSERT INTO "cities" ("id", "countryId", "name", "region", "population", "geonameId", "isActive", "updatedAt") VALUES
('clcity0001', 'clcountry01', 'Москва', 'Москва', 12506468, 524901, true, CURRENT_TIMESTAMP),
('clcity0002', 'clcountry01', 'Санкт-Петербург', 'Санкт-Петербург', 5351935, 498817, true, CURRENT_TIMESTAMP),
('clcity0003', 'clcountry01', 'Новосибирск', 'Новосибирская область', 1625631, 1496747, true, CURRENT_TIMESTAMP),
('clcity0004', 'clcountry01', 'Екатеринбург', 'Свердловская область', 1495066, 1486209, true, CURRENT_TIMESTAMP),
('clcity0005', 'clcountry01', 'Казань', 'Татарстан', 1257341, 551487, true, CURRENT_TIMESTAMP),
('clcity0006', 'clcountry01', 'Нижний Новгород', 'Нижегородская область', 1252236, 520555, true, CURRENT_TIMESTAMP),
('clcity0007', 'clcountry01', 'Челябинск', 'Челябинская область', 1202371, 1508291, true, CURRENT_TIMESTAMP),
('clcity0008', 'clcountry01', 'Самара', 'Самарская область', 1169719, 499099, true, CURRENT_TIMESTAMP),
('clcity0009', 'clcountry01', 'Омск', 'Омская область', 1178391, 1496153, true, CURRENT_TIMESTAMP),
('clcity0010', 'clcountry01', 'Ростов-на-Дону', 'Ростовская область', 1137704, 501175, true, CURRENT_TIMESTAMP),
('clcity0011', 'clcountry01', 'Уфа', 'Башкортостан', 1128787, 479561, true, CURRENT_TIMESTAMP),
('clcity0012', 'clcountry01', 'Красноярск', 'Красноярский край', 1093771, 1502026, true, CURRENT_TIMESTAMP),
('clcity0013', 'clcountry01', 'Воронеж', 'Воронежская область', 1057681, 472045, true, CURRENT_TIMESTAMP),
('clcity0014', 'clcountry01', 'Пермь', 'Пермский край', 1053938, 511196, true, CURRENT_TIMESTAMP),
('clcity0015', 'clcountry01', 'Волгоград', 'Волгоградская область', 1015587, 472757, true, CURRENT_TIMESTAMP),
('clcity0016', 'clcountry01', 'Краснодар', 'Краснодарский край', 932629, 542420, true, CURRENT_TIMESTAMP),
('clcity0017', 'clcountry01', 'Саратов', 'Саратовская область', 901361, 498677, true, CURRENT_TIMESTAMP),
('clcity0018', 'clcountry01', 'Тюмень', 'Тюменская область', 816800, 1488754, true, CURRENT_TIMESTAMP),
('clcity0019', 'clcountry01', 'Тольятти', 'Самарская область', 684709, 482283, true, CURRENT_TIMESTAMP),
('clcity0020', 'clcountry01', 'Ижевск', 'Удмуртия', 646277, 554840, true, CURRENT_TIMESTAMP),
('clcity0021', 'clcountry02', 'Минск', 'Минск', 1996553, 625144, true, CURRENT_TIMESTAMP),
('clcity0022', 'clcountry02', 'Гомель', 'Гомельская область', 501102, 628634, true, CURRENT_TIMESTAMP),
('clcity0023', 'clcountry02', 'Могилёв', 'Могилёвская область', 353110, 625665, true, CURRENT_TIMESTAMP),
('clcity0024', 'clcountry02', 'Витебск', 'Витебская область', 366299, 620127, true, CURRENT_TIMESTAMP),
('clcity0025', 'clcountry02', 'Гродно', 'Гродненская область', 361449, 627904, true, CURRENT_TIMESTAMP),
('clcity0026', 'clcountry02', 'Брест', 'Брестская область', 347077, 629634, true, CURRENT_TIMESTAMP);

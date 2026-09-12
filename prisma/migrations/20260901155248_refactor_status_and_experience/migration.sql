/*
  Warnings:

  - You are about to drop the column `experience` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "experience",
DROP COLUMN "status";

-- CreateTable
CREATE TABLE "statuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_statuses" (
    "userId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_statuses_pkey" PRIMARY KEY ("userId","statusId")
);

-- CreateTable
CREATE TABLE "experience_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experience_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_experiences" (
    "userId" TEXT NOT NULL,
    "experienceTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_experiences_pkey" PRIMARY KEY ("userId","experienceTypeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "statuses_name_key" ON "statuses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "experience_types_name_key" ON "experience_types"("name");

-- AddForeignKey
ALTER TABLE "user_statuses" ADD CONSTRAINT "user_statuses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_statuses" ADD CONSTRAINT "user_statuses_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_experiences" ADD CONSTRAINT "user_experiences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_experiences" ADD CONSTRAINT "user_experiences_experienceTypeId_fkey" FOREIGN KEY ("experienceTypeId") REFERENCES "experience_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed statuses
INSERT INTO "statuses" ("id", "name", "sortOrder") VALUES
('clstatus001', 'Ищу партию', 1),
('clstatus002', 'В игре', 2),
('clstatus003', 'Отдыхаю', 3),
('clstatus004', 'Ищу мастера', 4),
('clstatus005', 'Ищу игроков', 5),
('clstatus006', 'Новичок', 6);

-- Seed experience types
INSERT INTO "experience_types" ("id", "name", "sortOrder") VALUES
('clexp001', 'Нет опыта', 1),
('clexp002', 'До 6 месяцев', 2),
('clexp003', '6–12 месяцев', 3),
('clexp004', '1–3 года', 4),
('clexp005', '3–5 лет', 5),
('clexp006', '5+ лет', 6);

-- AlterTable
ALTER TABLE "games" ALTER COLUMN "durationHours" DROP NOT NULL;
ALTER TABLE "games" ALTER COLUMN "durationHours" DROP DEFAULT;

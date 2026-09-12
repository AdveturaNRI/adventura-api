-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('USER', 'FAVORITE_RECEIVED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FAVORITE_RETURNED';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'USER';

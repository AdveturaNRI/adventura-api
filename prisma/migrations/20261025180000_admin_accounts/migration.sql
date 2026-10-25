-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPERADMIN', 'MANAGER');

-- CreateTable
CREATE TABLE "admin_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'MANAGER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_accounts_email_key" ON "admin_accounts"("email");

-- Old AdminJS sessions carry no role and would see an empty admin; force re-login.
DO $$
BEGIN
  IF to_regclass('admin_sessions') IS NOT NULL THEN
    DELETE FROM "admin_sessions";
  END IF;
END $$;

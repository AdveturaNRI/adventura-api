-- Club editing data, soft deletion, and a membership foundation for club roles.
ALTER TABLE "clubs"
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "links" JSONB,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TYPE "ClubMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TABLE "club_members" (
  "clubId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ClubMemberRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "club_members_pkey" PRIMARY KEY ("clubId", "userId"),
  CONSTRAINT "club_members_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "club_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "club_members_userId_role_idx" ON "club_members"("userId", "role");
CREATE INDEX "clubs_deletedAt_idx" ON "clubs"("deletedAt");

-- Existing club owners become explicit members with management access.
INSERT INTO "club_members" ("clubId", "userId", "role")
SELECT "id", "ownerId", 'OWNER'::"ClubMemberRole"
FROM "clubs"
ON CONFLICT ("clubId", "userId") DO NOTHING;

ALTER TYPE "NotificationType" ADD VALUE 'CLUB_DELETED';

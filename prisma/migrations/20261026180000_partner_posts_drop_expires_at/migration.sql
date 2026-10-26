-- Partner news leaves the sidebar once the reader opens it; no expiry date anymore.
ALTER TABLE "partner_posts" DROP COLUMN "expiresAt";

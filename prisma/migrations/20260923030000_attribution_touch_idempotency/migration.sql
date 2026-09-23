ALTER TABLE "marketing_attribution_touches"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "marketing_attribution_touches_idempotencyKey_key"
ON "marketing_attribution_touches"("idempotencyKey");

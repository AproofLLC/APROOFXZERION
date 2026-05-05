-- 0010: idempotency_key dedup index + environment mode column

DO $$ BEGIN
  CREATE TYPE "public"."environment_mode" AS ENUM('testnet', 'staging', 'production');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN IF NOT EXISTS "mode" "public"."environment_mode" NOT NULL DEFAULT 'production';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canonical_events_org_env_idempotency_key_uidx"
  ON "canonical_events" ("organization_id", "environment_id", "idempotency_key")
  WHERE "idempotency_key" is not null;

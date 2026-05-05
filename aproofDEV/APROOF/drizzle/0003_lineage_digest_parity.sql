-- Persist lineage classification at ingest so GET /proofs/:id reconstructs the same proof_digest as POST.

ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "lineage_status" text;
--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "lineage_reason" text;
--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "matched_prior_event_id" uuid;
--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "matched_prior_version" integer;
--> statement-breakpoint

UPDATE "canonical_events"
SET
  "lineage_status" = COALESCE("lineage_status", 'existing_lineage_same_state'),
  "lineage_reason" = COALESCE("lineage_reason", 'migrated_legacy_row')
WHERE "lineage_status" IS NULL OR "lineage_reason" IS NULL;
--> statement-breakpoint

ALTER TABLE "canonical_events" ALTER COLUMN "lineage_status" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "canonical_events" ALTER COLUMN "lineage_reason" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "canonical_events" ALTER COLUMN "lineage_status" SET DEFAULT 'new_lineage';
--> statement-breakpoint
ALTER TABLE "canonical_events" ALTER COLUMN "lineage_reason" SET DEFAULT '';

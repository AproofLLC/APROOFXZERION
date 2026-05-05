-- Add 3-layer identity support:
-- - artifact_id (underlying object identity)
-- - logical_hash (content identity excluding event_id)

ALTER TABLE "canonical_events"
  ADD COLUMN IF NOT EXISTS "artifact_id" uuid;
--> statement-breakpoint

ALTER TABLE "canonical_events"
  ADD COLUMN IF NOT EXISTS "logical_hash" text;
--> statement-breakpoint

UPDATE "canonical_events"
SET
  "artifact_id" = "event_lineage_id",
  "logical_hash" = "canonical_hash"
WHERE "artifact_id" IS NULL OR "logical_hash" IS NULL;
--> statement-breakpoint

ALTER TABLE "canonical_events"
  ALTER COLUMN "artifact_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "canonical_events"
  ALTER COLUMN "logical_hash" SET NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "canonical_events_logical_hash_idx"
  ON "canonical_events" USING btree ("logical_hash");

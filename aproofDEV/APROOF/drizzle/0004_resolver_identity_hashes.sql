-- Persist lineage resolver artifact/occurrence identity strings so reconstruction matches POST digest.

ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "resolver_artifact_hash" text;
--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "resolver_occurrence_hash" text;

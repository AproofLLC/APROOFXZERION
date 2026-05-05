ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_quality" text;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_candidate_keys" jsonb;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_compatible_source_match" text;
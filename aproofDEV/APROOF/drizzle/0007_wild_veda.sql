ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "source_type_key" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "occurrence_hash" text;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "state_hash" text;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_source" text;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_rule_id" text;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_confidence" text;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_quality" text;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_candidate_keys" jsonb;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_compatible_source_match" text;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_stable_identity_json" jsonb;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "artifact_identity_summary" text;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD COLUMN IF NOT EXISTS "pipeline_stage_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "proof_units" ADD COLUMN IF NOT EXISTS "raw_event_id" uuid;--> statement-breakpoint
ALTER TABLE "proof_units" ADD COLUMN IF NOT EXISTS "canonical_event_id" uuid;--> statement-breakpoint
ALTER TABLE "proof_units" ADD COLUMN IF NOT EXISTS "artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "proof_units" ADD COLUMN IF NOT EXISTS "event_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "proof_units" ADD COLUMN IF NOT EXISTS "matched_prior_event_id" uuid;--> statement-breakpoint
ALTER TABLE "proof_units" ADD COLUMN IF NOT EXISTS "anchor_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "event_id" uuid;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "raw_event_id" uuid;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "canonical_event_id" uuid;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "event_lineage_id" uuid;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "artifact_id" uuid;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "step" text DEFAULT 'angle_evaluation' NOT NULL;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "reason_code" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "detail" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "failure_type" text;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "baseline_rule_id" text;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD COLUMN IF NOT EXISTS "missing_fields" jsonb;--> statement-breakpoint
CREATE TYPE "public"."anchor_batch_status" AS ENUM('pending', 'submitted', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."canonical_event_type" AS ENUM('request_received', 'record_accessed', 'retrieval_completed', 'model_invoked', 'policy_checked', 'identity_access_checked', 'decision_completed', 'action_completed', 'writeback_completed', 'alert_generated', 'handoff_completed', 'access_token_used', 'config_changed', 'deployment_changed');--> statement-breakpoint
CREATE TYPE "public"."canonical_proofability" AS ENUM('pending', 'proofable', 'not_proofable');--> statement-breakpoint
CREATE TYPE "public"."integrity_angle" AS ENUM('deterministic_integrity', 'model_identity_integrity', 'retrieval_integrity', 'policy_integrity', 'operational_integrity', 'identity_access_integrity', 'cross_system_integrity');--> statement-breakpoint
CREATE TYPE "public"."proof_anchor_state" AS ENUM('pending', 'submitted', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."proof_status" AS ENUM('conformant', 'flagged', 'violated', 'unverifiable');--> statement-breakpoint
CREATE TYPE "public"."rail_type" AS ENUM('system', 'service', 'agent', 'model', 'endpoint');--> statement-breakpoint
CREATE TABLE "anchor_batch_items" (
	"batch_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"proof_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anchor_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_hash" text NOT NULL,
	"root_hash" text NOT NULL,
	"proof_count" integer NOT NULL,
	"chain_name" text DEFAULT 'avalanche' NOT NULL,
	"tx_ref" text,
	"status" "anchor_batch_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"angle" "integrity_angle" NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"raw_event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_type" "rail_type" NOT NULL,
	"rail_type" "rail_type" NOT NULL,
	"event_lineage_id" uuid NOT NULL,
	"event_version" text NOT NULL,
	"trace_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"raw_payload_hash" text NOT NULL,
	"canonical_hash" text NOT NULL,
	"event_type" "canonical_event_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proofability" "canonical_proofability" DEFAULT 'pending' NOT NULL,
	"quarantine_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failure_locator_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proof_id" uuid NOT NULL,
	"failure_zone" text NOT NULL,
	"subject" text NOT NULL,
	"host" text NOT NULL,
	"angle" "integrity_angle" NOT NULL,
	"inspection_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapping_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"source_type_key" text NOT NULL,
	"canonical_event_type" "canonical_event_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_units" (
	"proof_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_lineage_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"angle" "integrity_angle" NOT NULL,
	"baseline_id" uuid,
	"status" "proof_status" NOT NULL,
	"severity" text,
	"delta_code" text,
	"expected_json" jsonb,
	"observed_json" jsonb,
	"evidence_json" jsonb,
	"anchor_state" "proof_anchor_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"raw_payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"rail_type" "rail_type" NOT NULL,
	"external_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anchor_batch_items" ADD CONSTRAINT "anchor_batch_items_batch_id_anchor_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."anchor_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anchor_batch_items" ADD CONSTRAINT "anchor_batch_items_proof_id_proof_units_proof_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."proof_units"("proof_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD CONSTRAINT "canonical_events_raw_event_id_raw_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD CONSTRAINT "canonical_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD CONSTRAINT "canonical_events_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD CONSTRAINT "canonical_events_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failure_locator_records" ADD CONSTRAINT "failure_locator_records_proof_id_proof_units_proof_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."proof_units"("proof_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_rules" ADD CONSTRAINT "mapping_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_rules" ADD CONSTRAINT "mapping_rules_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_units" ADD CONSTRAINT "proof_units_event_id_canonical_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."canonical_events"("event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_units" ADD CONSTRAINT "proof_units_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_units" ADD CONSTRAINT "proof_units_baseline_id_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."baselines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_events" ADD CONSTRAINT "raw_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_events" ADD CONSTRAINT "raw_events_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_batch_items_batch_ordinal_uidx" ON "anchor_batch_items" USING btree ("batch_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_batch_items_proof_uidx" ON "anchor_batch_items" USING btree ("proof_id");--> statement-breakpoint
CREATE INDEX "anchor_batch_items_batch_idx" ON "anchor_batch_items" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_batches_batch_hash_uidx" ON "anchor_batches" USING btree ("batch_hash");--> statement-breakpoint
CREATE INDEX "anchor_batches_status_idx" ON "anchor_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "api_keys_org_env_idx" ON "api_keys" USING btree ("organization_id","environment_id");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "baselines_subject_angle_effective_idx" ON "baselines" USING btree ("subject_id","angle","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "baselines_subject_angle_version_uidx" ON "baselines" USING btree ("subject_id","angle","version");--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_events_raw_event_uidx" ON "canonical_events" USING btree ("raw_event_id");--> statement-breakpoint
CREATE INDEX "canonical_events_org_env_occurred_idx" ON "canonical_events" USING btree ("organization_id","environment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "canonical_events_subject_occurred_idx" ON "canonical_events" USING btree ("subject_id","occurred_at");--> statement-breakpoint
CREATE INDEX "canonical_events_lineage_idx" ON "canonical_events" USING btree ("event_lineage_id");--> statement-breakpoint
CREATE INDEX "canonical_events_canonical_hash_idx" ON "canonical_events" USING btree ("canonical_hash");--> statement-breakpoint
CREATE INDEX "environments_org_idx" ON "environments" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_org_name_uidx" ON "environments" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "failure_locator_records_proof_uidx" ON "failure_locator_records" USING btree ("proof_id");--> statement-breakpoint
CREATE INDEX "failure_locator_records_angle_idx" ON "failure_locator_records" USING btree ("angle");--> statement-breakpoint
CREATE INDEX "mapping_rules_org_env_idx" ON "mapping_rules" USING btree ("organization_id","environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mapping_rules_active_uidx" ON "mapping_rules" USING btree ("organization_id","environment_id","source_type_key");--> statement-breakpoint
CREATE INDEX "organizations_created_at_idx" ON "organizations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "proof_units_event_idx" ON "proof_units" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "proof_units_anchor_state_idx" ON "proof_units" USING btree ("anchor_state");--> statement-breakpoint
CREATE INDEX "proof_units_subject_angle_idx" ON "proof_units" USING btree ("subject_id","angle");--> statement-breakpoint
CREATE INDEX "raw_events_org_env_received_idx" ON "raw_events" USING btree ("organization_id","environment_id","received_at");--> statement-breakpoint
CREATE INDEX "raw_events_raw_hash_idx" ON "raw_events" USING btree ("raw_payload_hash");--> statement-breakpoint
CREATE INDEX "subjects_org_env_idx" ON "subjects" USING btree ("organization_id","environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_org_env_external_present_uidx" ON "subjects" USING btree ("organization_id","environment_id","external_key") WHERE "subjects"."external_key" is not null;
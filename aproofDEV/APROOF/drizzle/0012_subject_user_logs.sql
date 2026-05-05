-- Subject-scoped user activity logs (not canonical events / not proof pipeline).

CREATE TABLE "subject_user_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"action_type" text NOT NULL,
	"action_title" text NOT NULL,
	"summary" text,
	"source" text,
	"actor_id" text,
	"actor_type" text,
	"trace_id" text,
	"related_event_id" uuid,
	"related_proof_id" uuid,
	"related_lineage_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subject_user_logs" ADD CONSTRAINT "subject_user_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subject_user_logs" ADD CONSTRAINT "subject_user_logs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subject_user_logs" ADD CONSTRAINT "subject_user_logs_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "subject_user_logs_scope_occurred_id_idx" ON "subject_user_logs" USING btree ("organization_id","environment_id","subject_id","occurred_at","id");

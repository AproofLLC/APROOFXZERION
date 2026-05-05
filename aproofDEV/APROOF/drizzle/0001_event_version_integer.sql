-- Migrate canonical_events.event_version from text -> integer.
-- Fail loudly if historical rows are non-numeric or non-positive.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM canonical_events
    WHERE event_version !~ '^[1-9][0-9]*$'
  ) THEN
    RAISE EXCEPTION 'canonical_events.event_version contains non-positive or non-integer text values; clean data before migration';
  END IF;
END
$$;
--> statement-breakpoint

ALTER TABLE "canonical_events"
  DROP CONSTRAINT IF EXISTS "canonical_events_event_version_positive_int_chk";
--> statement-breakpoint

ALTER TABLE "canonical_events"
  ALTER COLUMN "event_version" TYPE integer USING ("event_version"::integer);
--> statement-breakpoint

ALTER TABLE "canonical_events"
  ADD CONSTRAINT "canonical_events_event_version_positive_int_chk"
  CHECK ("event_version" > 0);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "canonical_events_org_env_lineage_version_uidx"
  ON "canonical_events" USING btree ("organization_id","environment_id","event_lineage_id","event_version");

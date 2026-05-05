-- Backfill explicit environment.mode from legacy name heuristics (one-time after column add).

UPDATE "environments"
SET "mode" = CASE
  WHEN lower("name") LIKE '%testnet%' OR lower("name") LIKE '%sandbox%' OR lower("name") LIKE '%test%' THEN 'testnet'::"public"."environment_mode"
  WHEN lower("name") LIKE '%staging%' OR lower("name") LIKE '%stag%' THEN 'staging'::"public"."environment_mode"
  ELSE 'production'::"public"."environment_mode"
END
WHERE true;

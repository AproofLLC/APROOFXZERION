/**
 * Canonical subject fields shared by GET/POST/PATCH subject routes and
 * `GET /subjects/:id/overview` → `subject_header`. Keeps naming and nullability aligned.
 */
export const RAIL_TO_SUBJECT_TYPE: Record<string, string> = {
  system: "system",
  service: "service",
  agent: "agent",
  model: "model",
  endpoint: "endpoint",
};

export function subjectTypeFromRail(rail: string): string {
  return RAIL_TO_SUBJECT_TYPE[rail] ?? rail;
}

/** Core subject block: list items, GET/PATCH body, and overview.subject_header. */
export type SubjectCoreBlock = {
  subject_id: string;
  subject_type: string;
  organization_id: string;
  environment_id: string;
  environment: string;
  external_key: string | null;
  created_at: string;
  latest_event_timestamp: string | null;
  latest_proof_timestamp: string | null;
  latest_anchor_timestamp: string | null;
};

/** Ordered keys for contract tests (subset of JSON keys; excludes non-core fields like external_key). */
export const SUBJECT_CORE_JSON_KEYS: (keyof SubjectCoreBlock)[] = [
  "subject_id",
  "subject_type",
  "organization_id",
  "environment_id",
  "environment",
  "external_key",
  "created_at",
  "latest_event_timestamp",
  "latest_proof_timestamp",
  "latest_anchor_timestamp",
];

/**
 * Exhaustive surface of `reason` strings returned with HTTP 422 and `code: "NOT_PROOFABLE"`
 * from the ingest path (proofability gate, identity dedupe, and race fallbacks).
 * Kept in one module for API freeze docs and contract tests.
 */
export const NOT_PROOFABLE_REASON_CODES = [
  // proofability-gate
  "subject_not_unique_or_missing",
  "mapping_missing",
  "invalid_event_id",
  "invalid_event_lineage_id",
  "event_version_invalid",
  "trace_id_empty",
  "occurred_at_invalid",
  "occurred_at_in_future",
  // event_id + canonical_hash
  "duplicate_event_id_same_hash",
  "duplicate_event_id_hash_conflict",
  // lineage + version + logical_hash (artifact-scoped)
  "duplicate_lineage_version_same_hash",
  "duplicate_lineage_version_hash_conflict",
  "lineage_artifact_identity_conflict",
  "LINEAGE_ARTIFACT_IDENTITY_CONFLICT",
  "LINEAGE_VERSION_REPLAY_REJECTED",
  "LINEAGE_AMBIGUOUS_ARTIFACT_IDENTITY",
  "ARTIFACT_ID_CONFLICT_WITH_DERIVED",
  "ARTIFACT_ID_NOT_DERIVABLE",
  "ARTIFACT_STABLE_IDENTITY_CONFLICT",
  "ARTIFACT_ID_AMBIGUOUS",
  "ARTIFACT_IDENTITY_INSUFFICIENT",
  "duplicate_submission_conflict",
  // read path: stored canonical row not proofable
  "canonical_not_proofable",
] as const;

export type NotProofableReasonCode = (typeof NOT_PROOFABLE_REASON_CODES)[number];

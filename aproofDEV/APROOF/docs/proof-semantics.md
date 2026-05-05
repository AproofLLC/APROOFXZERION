# Proof Semantics (Locked)

This document locks the intended meaning of proof outcomes and reason classes before API freeze.

Universal surface rule:
- every proof carries all seven angles;
- `insufficient_evidence` expresses evidence sufficiency, not angle omission.

## 1) `insufficient_evidence`

`insufficient_evidence` means the system cannot produce a reliable pass/fail for that angle.

Controlled reasons:
- `NO_SOURCES`
  - product-facing code when the canonical event type does not carry evaluable evidence for that angle (replaces legacy `INSUFFICIENT_EVIDENCE_FOR_EVENT_TYPE` in API output).
- `INSUFFICIENT_PIPELINE_WIRING_ERROR`
  - expected proof unit was not produced even though evaluator path should exist.

Reserved reason classes for future hardening:
- `INSUFFICIENT_INGESTION_DEFECT`
- `INSUFFICIENT_MALFORMED_EVIDENCE`
- `INSUFFICIENT_EVALUATOR_BUG`

## 2) `fail`

`fail` means evaluator produced a violated result with concrete mismatch/threshold/policy/etc evidence.
Examples: `DETERMINISTIC_DIGEST_MISMATCH`, `OPERATIONAL_LATENCY_EXCEEDED`.

## 3) Internal Error Meaning

Current API does not expose separate top-level "internal error" product status.
Internal pipeline issues that still yield a proof surface are encoded as:
- angle status `insufficient_evidence`
- reason `INSUFFICIENT_PIPELINE_WIRING_ERROR`

## 4) Baseline / Config Missing Meaning

Baseline/config problems map to `CONFIG_MISSING` at failure intelligence layer.
Examples: `BASELINE_MISSING`, baseline shape/type invalid codes.

## 5) Malformed Evidence Meaning

Malformed observed evidence maps to payload/evidence-missing semantics at rollup level.
Examples: `POLICY_OBSERVED_SHAPE`, `IDENTITY_ACCESS_OBSERVED_SHAPE` map to `PAYLOAD_MISSING`.

## 6) Replay vs Conflict Semantics

- same `event_id` + same `canonical_hash` => `duplicate_event_id_same_hash`
- same `event_id` + different `canonical_hash` => `duplicate_event_id_hash_conflict`
- same `artifact_id` + same `event_lineage_id` + same `event_version` + same `logical_hash` => `duplicate_lineage_version_same_hash`
- same `artifact_id` + same `event_lineage_id` + same `event_version` + different `logical_hash` => `duplicate_lineage_version_hash_conflict`
- same `event_lineage_id` + same `event_version` + different `artifact_id` (existing row) => `lineage_artifact_identity_conflict`

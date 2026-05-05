# Idempotency + Lineage Behavior (Strict)

This document defines duplicate handling and lineage ordering behavior.

## 0) Artifact identity resolution precedence

- `event_id` = exact event instance identity.
- `artifact_id` = underlying object identity.
- `event_lineage_id` = history stream identity for that artifact.
- `event_version` = position in that history stream.

Resolution order:

1. Provided `artifact_id` is authoritative.
2. When deterministic stable-field derivation exists, provided value must match derived value or reject with `ARTIFACT_ID_CONFLICT_WITH_DERIVED`.
3. If omitted, derive deterministically.
4. If omitted and not derivable, reject with `ARTIFACT_ID_NOT_DERIVABLE`.

## 1) Duplicate / Idempotency Matrix

### Same `event_id` submitted twice

- If computed **`canonical_hash`** is the same:
  - reject as duplicate replay with reason `duplicate_event_id_same_hash`
- If computed **`canonical_hash`** differs:
  - reject as conflict with reason `duplicate_event_id_hash_conflict`

### Same `artifact_id` + same `event_lineage_id` + same `event_version`

- If an existing row has a **different `artifact_id`** at that lineage slot:
  - reject with `lineage_artifact_identity_conflict` (no cross-artifact merge on a shared lineage UUID).
- If **`logical_hash`** matches the existing row:
  - reject as duplicate replay with reason `duplicate_lineage_version_same_hash`
- If **`logical_hash`** differs:
  - reject as conflict with reason `duplicate_lineage_version_hash_conflict`

`logical_hash` is computed from `trace_id`, `subject_id`, normalized `event_type`, and `occurred_at` (see [hash-law.md](./hash-law.md)).

### Same `trace_id` + different event

- Allowed. `trace_id` is correlation, not identity key.

### Client retry without `event_id`

- Server generates a new `event_id`; dedupe protection still applies by **artifact-scoped lineage + version** and **`logical_hash`** rules above.

## 2) Out-of-Order Lineage Policy

- Policy: accept but flag anomaly.
- Flag emitted in success response:
  - `lineage_anomaly: "OUT_OF_ORDER_LINEAGE_VERSION"`
- Trigger condition:
  - incoming `event_version` is less than or equal to the maximum version already seen for the **same `artifact_id` and `event_lineage_id`** in the same org/environment.

Examples:

- version `3` first, then version `2`: second submit is accepted with anomaly flag.
- version `4` first, then version `2`: later submit is accepted with anomaly flag.

## 3) Side-Effect Rule

- Duplicate/conflict submissions do not create canonical event/proof rows.
- Raw ingest row is still recorded for traceability.

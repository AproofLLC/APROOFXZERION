# Hash Law (Strict)

This document defines mandatory hashing behavior at ingress and canonicalization time.

## Identity Layers

- `event_id`: instance identity (one concrete submission instance)
- `artifact_id`: underlying object identity
- `event_lineage_id` + `event_version`: evolution identity
- `canonical_hash`: instance identity hash (includes `event_id`)
- `logical_hash`: content identity hash (excludes `event_id`)

## 1) Normalization Preconditions

- Canonical event aliases must be normalized before any routing/canonical hashing/storage/output decisions.
- Current rule: `access_token_used` normalizes to `identity_access_checked`.

## 2) `raw_payload_hash`

Algorithm: `SHA256(stableStringify(rawHashInput))`

`rawHashInput` fields:
- full ingestion envelope:
  - `organization_id`
  - `environment_id`
  - `source_type_key`
  - `subject_id`
  - optional `event_id`
  - `event_lineage_id`
  - `event_version`
  - `trace_id`
  - `occurred_at`
  - `payload`
- plus derived `canonical_event_type` (normalized value if mapping exists; otherwise `null`)

## 3) `canonical_hash`

Algorithm: `SHA256(stableStringify({ event_id, event_type, occurred_at, subject_id, trace_id }))`

Rules:
- `event_type` uses normalized canonical value.
- `occurred_at` is ISO-8601 UTC string (`Date.toISOString()`).

## 3b) `logical_hash`

Algorithm: `SHA256(stableStringify({ trace_id, subject_id, event_type, occurred_at }))`

Rules:
- Uses the same canonicalization rules as `canonical_hash`.
- Explicitly excludes `event_id`.
- Used for lineage/version replay vs conflict semantics.

## 4) Serialization Law (`stableStringify`)

- Object keys sorted lexicographically at every depth.
- Arrays preserve input order (no sorting).
- `Date` values serialize as ISO strings.
- `null` serializes as JSON `null`.
- Omitted optional fields remain omitted; explicit `null` remains explicit `null`.

## 5) Determinism Requirements

- Same normalized input must produce identical hash bytes.
- Any field/value/order difference after normalization must change hash output.
- Alias-equivalent canonical event types must hash identically after normalization.

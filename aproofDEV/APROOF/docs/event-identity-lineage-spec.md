# Event Identity + Lineage Spec (Strict)

This spec defines strict identity, lineage, and versioning behavior for ingest and proof generation.

## 1) `event_id` Definition

- `event_id` is the unique identity of one concrete event version instance.
- It is a UUID.
- Client may supply it; if omitted, server generates it.
- Distinct versions in the same lineage must not reuse the same `event_id`.

## 2) `artifact_id` Definition

- `artifact_id` is the identity of the **underlying object** the event is about (client-supplied or deterministically derived UUID).
- Resolution precedence is strict and deterministic:
  1. If client provides `artifact_id`, it is authoritative.
  2. If `artifact_id` is also derivable from stable fields, server validates provided vs derived:
     - match: accept (`provided_validated`)
     - mismatch: reject (`ARTIFACT_ID_CONFLICT_WITH_DERIVED`)
  3. If omitted, derive deterministically from stable identity fields.
  4. If omitted and not deterministically derivable, reject (`ARTIFACT_ID_NOT_DERIVABLE`).
- The server never silently overrides a provided `artifact_id` and never guesses loosely.
- Lineage duplicate semantics are **scoped by `artifact_id`**: the same `(event_lineage_id, event_version)` slot cannot be reused by a **different** artifact without rejection (`lineage_artifact_identity_conflict`).

Examples (correct behavior):

- Same X-ray analyzed twice: different `event_id`, same `artifact_id`.
- Same patient advocate chart updated over time: different `event_id`, same `artifact_id`.
- Same patient vial set altered/retested: different `event_id`, same `artifact_id`.

## 3) `event_lineage_id` Meaning

- `event_lineage_id` groups all versions/revisions of the same logical upstream stream.
- It is stable across retries and corrected versions for that logical stream.
- It is a UUID. **Optional on ingest:** if omitted, the server defaults it to **`artifact_id`** (one stream per derived object unless the client overrides).

## 4) `event_version` Semantics

- `event_version` is a positive integer (`>= 1`).
- It denotes the sequence/version inside a lineage.
- `1` is the initial version.
- Higher values are newer mutations/corrections within the same lineage.

## 5) `trace_id` Semantics

- `trace_id` links operational flow across distributed systems.
- It is required and non-empty.
- It is not a substitute for `event_id` or `event_lineage_id`; multiple events may share one trace.

## 6) `source_event_ref` vs `upstream_event_id` vs `previous_event_id`

- `source_event_ref`: optional source-system reference token (string) for operator/debug readability.
- `upstream_event_id`: optional foreign identifier from the producer domain (if present in payload conventions).
- `previous_event_id`: optional pointer to a prior event version instance.

Current ingestion contract only requires the envelope fields listed in `protocol-consistency.md`; additional refs are payload/domain-level conventions unless promoted into the ingestion schema.

## 7) Sameness Rules

Two records occupy the same **lineage slot** if they share:

- `organization_id`, `environment_id`, **`artifact_id`**, `event_lineage_id`, and `event_version`.

Replay vs conflict for that slot uses **`logical_hash`** (excludes `event_id`). See [idempotency-lineage-behavior.md](./idempotency-lineage-behavior.md).

Two records are the same concrete event instance if:

- `event_id` is the same (dedupe uses **`canonical_hash`**).

## 8) Mutation/Versioning Rules

- Mutation/correction in the same logical chain:
  - keep `event_lineage_id`,
  - increment `event_version`,
  - issue a new `event_id`.
- Retry of the exact same instance should keep `event_id` and `event_version` (idempotency behavior is product-policy specific).

## 9) Tamper-Detection Rules

- `raw_payload_hash` is derived from ingestion payload/envelope representation for raw integrity checks.
- `canonical_hash` is derived from canonicalized fields and canonical event type (includes `event_id`).
- `logical_hash` uses the same canonical fields but **excludes `event_id`**; used for lineage/version slot semantics.
- Hash mismatch across expected immutable fields indicates tampering or inconsistent canonicalization inputs.

## 10) Client-Supplied vs Server-Derived

Client-supplied (ingestion envelope):

- `organization_id`, `environment_id`, `subject_id`, `source_type_key`,
- `event_version`, `trace_id`, `occurred_at`, `payload`,
- optional `event_id`, optional `artifact_id`, optional `event_lineage_id`.

Server-derived:

- `canonical_event_type`, `raw_payload_hash`, `canonical_hash`, `logical_hash`,
- proof artifacts (`proof_units`, `product_proof`, `failure_intelligence`),
- generated identifiers/timestamps such as `raw_event_id` and server-side creation metadata.

## 11) Derivation Algorithm (normative)

### event_id derivation (when omitted)

Seed: deterministic UUID v5 from `{ subject_id, source_type_key, trace_id, occurred_at, payload, canonical_event_type }` via `stableStringify` + SHA-256.

Implementation: `resolveEventIdentity` in `src/pipeline/identity-resolver.ts`.

### artifact_id derivation (when omitted)

Stable field rule: derives from `{ subject_id, canonical_event_type, payload }` subset (see `deriveArtifactIdentity`).

- If derivable: deterministic UUID v5 from stable fields.
- If provided and matches derived: accepted.
- If provided and conflicts with derived: rejected with `ARTIFACT_ID_CONFLICT_WITH_DERIVED`.
- If omitted and not derivable: rejected with `ARTIFACT_ID_NOT_DERIVABLE`.

### event_lineage_id derivation (when omitted)

Defaults to `artifact_id`. If `artifact_id` derivation fails, falls back to deterministic lineage seed.

### event_version

Required in current schema. Positive integer. Lineage resolution validates version against existing lineage state.

### Conflict rejection codes

- `ARTIFACT_ID_CONFLICT_WITH_DERIVED`: provided artifact_id does not match server-derived value.
- `ARTIFACT_ID_NOT_DERIVABLE`: artifact_id was omitted and stable derivation fields are insufficient.
- `duplicate_event_id_same_hash`: event_id already exists with same canonical_hash (replay).
- `duplicate_event_id_hash_conflict`: event_id already exists with different canonical_hash (conflict).
- `duplicate_lineage_version_same_hash`: lineage+version slot already occupied, same logical content.
- `duplicate_lineage_version_hash_conflict`: lineage+version slot already occupied, different content.
- `lineage_artifact_identity_conflict`: lineage+version matches different artifact_id.

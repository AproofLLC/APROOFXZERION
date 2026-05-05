# Protocol Consistency (Authoritative)

This document is the authoritative alignment between protocol docs and implementation.

## 1) Angle Applicability Rule

- All seven integrity angles are part of the proof surface for every event.
- No angle is silently omitted from product proof rendering.
- Event type controls evaluator triggering and evidence sufficiency, not angle membership.
- If an angle has no usable evidence for a given event, it must still render with an insufficient state (for example `insufficient_evidence` with a reason like no unit/evidence), not disappear.

## 2) `event_version` Standard

- Ingestion type: integer number.
- Validation rule: positive integer (`>= 1`).
- Storage: persisted as integer (`event_version` int) in canonical storage.

## 3) Ingestion Envelope vs Canonical Derived Fields

### Ingestion Envelope Fields (client-supplied)

- `organization_id`
- `environment_id`
- `subject_id`
- `source_type_key`
- optional `event_id`
- optional `artifact_id`
- optional `event_lineage_id` (defaults to `artifact_id` when omitted)
- `event_version` (integer)
- `trace_id`
- `occurred_at`
- `payload`

### Canonical Derived Fields (server-derived)

- `canonical_event_type`
- `raw_payload_hash`
- `canonical_hash`
- `product_proof`
- `failure_intelligence`
- `event_id` (if not client-supplied)
- `raw_event_id`
- derived proof references (`proof_units[].proof_id`, proof digest/anchor metadata, and related derived refs)

## 4) Canonical Event Dictionary (matches code enum)

The canonical event type enum is:

- `request_received`
- `record_accessed`
- `retrieval_completed`
- `model_invoked`
- `policy_checked`
- `identity_access_checked` (**canonical**)
- `decision_completed`
- `action_completed`
- `writeback_completed`
- `alert_generated`
- `handoff_completed`
- `access_token_used` (**legacy alias; deprecated**)
- `config_changed`
- `deployment_changed`

### Alias/Deprecation Status

- `identity_access_checked`: canonical name for identity/access events.
- `access_token_used`: legacy alias retained for compatibility; deprecated for new mappings.

New integrations should map to `identity_access_checked`.

## 5) Insufficient Semantics (Controlled)

`insufficient_evidence` must use controlled reason classes so it does not hide root causes:

- `INSUFFICIENT_INGESTION_DEFECT`
  - ingestion envelope invalid/incomplete after validation boundary (reserved for strict ingest checks)
- `INSUFFICIENT_MALFORMED_EVIDENCE`
  - payload/evidence shape malformed for angle evaluator contracts
- `INSUFFICIENT_EVALUATOR_BUG`
  - evaluator execution path failed unexpectedly (reserved)
- `INSUFFICIENT_PIPELINE_WIRING_ERROR`
  - expected proof unit missing when evaluator should have run
- `NO_SOURCES`
  - event type does not carry evaluable evidence for that angle (frozen product `reason_code`)

Current implementation explicitly emits:
- `INSUFFICIENT_PIPELINE_WIRING_ERROR`
- `NO_SOURCES`

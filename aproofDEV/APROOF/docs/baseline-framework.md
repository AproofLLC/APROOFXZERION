# APROOF Baseline Framework

## Core Model

- Universal angles: all proofs emit all 7 angles.
- Subject-specific baselines: derivation rules vary by canonical subject type (`model`, `agent`, `service`, `endpoint`, `system`).
- Baseline contract is centralized in `src/baselines/baseline-registry.ts`.

## Baseline Metadata

Each angle output carries deterministic baseline fields:

- `baseline_present`
- `baseline_status` (`present` | `missing` | `insufficient` | `unsupported`)
- `baseline_source` (`declared` | `observed` | `policy` | `mixed` | `none`)
- `baseline_version`
- `baseline_rule_id`
- `baseline_summary`
- `expected_summary`
- `actual_summary`
- `delta_detected`
- `delta_type` (`none` | `drift` | `violation` | `missing` | `unknown`)
- `diff_summary`

## Fail-Safe Behavior

Missing/partial baseline data never silently passes:

- no thrown errors for ordinary missing context
- no blank angles
- explicit safe outputs with stable reason codes (for example `NO_BASELINE_SOURCE`, `SUBJECT_FIELD_MISSING`, `INSUFFICIENT_CONTEXT`, `BASELINE_MISSING`)
- empty `evidence_refs` where evidence is unavailable

## Persisted Baseline Snapshot

Proof-time baseline truth is persisted per proof unit in `proof_units.evidence_json`:

- `baseline_snapshot`: exact derived angle baseline at write-time
- `diff`: deterministic delta contract at write-time

Read reconstruction reuses this persisted snapshot/diff so historical proof reads do not silently drift due to later derivation rule changes.

## Failure Locator Extensions

Failure locator remains backward-compatible and now may include:

- `failure_type`
- `missing_fields`
- `baseline_rule_id`

for baseline/diff-related failures when deterministically available.

## No-Sources Behavior

If no usable baseline source exists:

- `baseline_present = false`
- `baseline_source = "none"`
- `baseline_status = "missing"` (or `insufficient` where applicable)
- explicit reason code in angle output

## Subject Type Normalization

Canonical subject types are enforced:

- `model`, `agent`, `service`, `endpoint`, `system`

Legacy aliases are normalized before derivation (`llm -> model`, `bot -> agent`, `saas -> service`) and are not API-visible in baseline metadata.

## Digest Contract

Baseline metadata is currently **excluded** from proof digest inputs to keep digest compatibility stable. Digest behavior remains deterministic and backward-compatible with existing hashable payload fields.

## Extending Baselines

To add or evolve a subject type rule:

1. Update `RULES` in `src/baselines/baseline-registry.ts`.
2. Keep `baseline_rule_id` and `baseline_version` deterministic.
3. Add/adjust unit tests in `src/baselines/baseline-registry.test.ts`.
4. Run readiness suites (`e2e/subject-readiness.e2e.test.ts` and `e2e/investor-demo-readiness.e2e.test.ts`).

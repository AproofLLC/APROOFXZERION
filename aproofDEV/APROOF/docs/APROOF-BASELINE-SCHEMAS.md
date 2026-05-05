# AProof baseline schemas (universal)

This document is the baseline-schema reference for the frozen AProof model.

## Universal rules (authoritative)

- AProof has a **universal seven-angle proof surface**.
- Every proof always returns all seven angles.
- Every angle has an **AProof-owned baseline schema** and evaluator logic.
- Customers configure **baseline values**, not evaluator logic.
- Event type can affect evidence sufficiency (`insufficient_evidence` / `NO_SOURCES`), but never removes an angle from the proof surface.

## Universal angle set

1. `policy_integrity`
2. `identity_access_integrity`
3. `operational_integrity`
4. `model_identity_integrity`
5. `retrieval_integrity`
6. `deterministic_integrity`
7. `cross_system_integrity`

---

## Inventory by angle

### `policy_integrity`

- **Purpose:** Validate required policy tags in the event payload.
- **Schema/type:** `policy_integrity_v1`
- **Required fields:**
  - `type: "policy_integrity_v1"`
  - `required_tags: string[]`
- **Optional fields:** none
- **Evaluator expects:**
  - Baseline `required_tags` as string array
  - Payload at `payload.policy.tags` as string array
- **Failure mode when baseline missing/invalid:**
  - Missing baseline at runtime path: `BASELINE_MISSING` (proof unit status `unverifiable`)
  - Invalid baseline shape/type: `POLICY_BASELINE_SHAPE` / `POLICY_BASELINE_TYPE` (`unverifiable`)
  - Invalid observed shape: `POLICY_OBSERVED_SHAPE` (`unverifiable`)

### `identity_access_integrity`

- **Purpose:** Validate principal identity/access evidence (token/scopes/tenant/access log).
- **Schema/type:** `identity_access_integrity_v1`
- **Required fields:**
  - `type: "identity_access_integrity_v1"`
  - `required_scopes: string[]`
- **Optional fields:**
  - `expected_tenant_id?: string | null`
  - `require_access_log?: boolean`
- **Evaluator expects:**
  - Payload object at `payload.identity_access`
  - `principal_id` non-empty string
  - `granted_scopes` string array
  - Optional token/access-log/tenant checks per baseline values
- **Failure mode when baseline missing/invalid:**
  - Missing baseline at runtime path: `BASELINE_MISSING` (proof unit status `unverifiable`)
  - Invalid baseline shape/type: `IDENTITY_ACCESS_BASELINE_SHAPE` / `IDENTITY_ACCESS_BASELINE_TYPE` (`unverifiable`)
  - Invalid observed shape: `IDENTITY_ACCESS_OBSERVED_SHAPE` (`unverifiable`)

### `operational_integrity`

- **Purpose:** Validate runtime success, latency threshold, and runtime-error presence.
- **Schema/type:** `operational_integrity_v1`
- **Required fields:**
  - `type: "operational_integrity_v1"`
  - `expected_status: "success"`
  - `max_latency_ms: number`
  - `require_no_runtime_error: boolean`
- **Optional fields:**
  - `version?: number`
  - `effective_from?: string`
- **Evaluator expects:**
  - Event values: `execution_status`, `latency_ms`, `runtime_error`
- **Failure mode when baseline missing/invalid:**
  - Missing baseline at runtime path: `BASELINE_MISSING` (proof unit status `unverifiable`)
  - Invalid baseline or payload shape in process-event guard: `OPERATIONAL_BASELINE_OR_PAYLOAD_SHAPE` (`unverifiable`)

### `model_identity_integrity`

- **Purpose:** Validate observed model identity against expected model.
- **Schema/type:** `model_identity_integrity_v1`
- **Required fields:**
  - `type: "model_identity_integrity_v1"`
  - `expected_model: string`
  - `require_exact_match: boolean`
- **Optional fields:**
  - `version?: number`
  - `effective_from?: string`
- **Evaluator expects:**
  - Event value: `observed_model` string
- **Failure mode when baseline missing/invalid:**
  - Missing baseline at runtime path: `BASELINE_MISSING` (proof unit status `unverifiable`)
  - Invalid baseline shape/type: `MODEL_IDENTITY_BASELINE_INVALID` (evaluation status `violated`)
  - Missing observed model: `MODEL_IDENTITY_MISSING` (`violated`)

### `retrieval_integrity`

- **Purpose:** Validate retrieved-source evidence coverage and minimum count.
- **Schema/type:** `retrieval_integrity_v1`
- **Required fields:**
  - `type: "retrieval_integrity_v1"`
  - `expected_sources: string[]`
  - `min_sources: number`
- **Optional fields:** none
- **Evaluator expects:**
  - Event value: `retrieved_sources` string array
- **Failure mode when baseline missing/invalid:**
  - Missing baseline at runtime path: `BASELINE_MISSING` (proof unit status `unverifiable`)
  - Invalid baseline: `RETRIEVAL_BASELINE_INVALID` (`violated`)
  - Missing observed sources: `RETRIEVAL_NO_SOURCES` (`violated`)

### `deterministic_integrity`

- **Purpose:** Validate deterministic digest matches expected baseline digest.
- **Schema/type:** `deterministic_integrity_v1`
- **Required fields:**
  - `type: "deterministic_integrity_v1"`
  - `expected_digest: string`
  - `algorithm: "sha256"`
  - `require_exact_match: boolean`
- **Optional fields:** none
- **Evaluator expects:**
  - Event value: `observed_digest` string
- **Failure mode when baseline missing/invalid:**
  - Missing baseline at runtime path: `BASELINE_MISSING` (proof unit status `unverifiable`)
  - Invalid baseline: `DETERMINISTIC_BASELINE_INVALID` (`violated`)
  - Missing digest: `DETERMINISTIC_DIGEST_MISSING` (`violated`)

### `cross_system_integrity`

- **Purpose:** Validate expected cross-system participation/linkage.
- **Schema/type:** `cross_system_integrity_v1`
- **Required fields:**
  - `type: "cross_system_integrity_v1"`
  - `expected_systems: string[]`
  - `require_all_systems: boolean`
- **Optional fields:** none
- **Evaluator expects:**
  - Event value: `observed_systems` string array
- **Failure mode when baseline missing/invalid:**
  - Missing baseline at runtime path: `BASELINE_MISSING` (proof unit status `unverifiable`)
  - Invalid baseline: `CROSS_SYSTEM_BASELINE_INVALID` (`violated`)
  - Missing observed systems: `CROSS_SYSTEM_SYSTEMS_MISSING` (`violated`)

---

## Notes for product/UI

- Template and onboarding UI should always present all seven angle sections.
- “No sources” (`NO_SOURCES`) means insufficient evidence for an angle on that event type; it does not imply angle removal.
- Baseline authoring UX should focus on field values and guardrails, not custom evaluator logic.

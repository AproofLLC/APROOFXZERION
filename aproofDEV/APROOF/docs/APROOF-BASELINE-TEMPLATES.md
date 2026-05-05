# AProof baseline templates (universal surface)

This page defines the onboarding/template surface for baselines. It does not change protocol behavior.

## Universal template structure

All seven keys are always part of the template surface:

```json
{
  "policy_integrity": { "...": "..." },
  "identity_access_integrity": { "...": "..." },
  "operational_integrity": { "...": "..." },
  "model_identity_integrity": { "...": "..." },
  "retrieval_integrity": { "...": "..." },
  "deterministic_integrity": { "...": "..." },
  "cross_system_integrity": { "...": "..." }
}
```

## Authoritative rules

- Customers/subjects fill in **values** for baseline fields.
- AProof owns schema meaning and evaluator logic.
- Template completeness does not imply all angles have evidence on every event type; proof surface still always includes all seven angles.
- `insufficient_evidence` / `NO_SOURCES` indicates evidence sufficiency, not angle existence.

For schema details, use [APROOF-BASELINE-SCHEMAS.md](./APROOF-BASELINE-SCHEMAS.md).

---

## Example template 1 — LLM assistant

```json
{
  "policy_integrity": {
    "type": "policy_integrity_v1",
    "required_tags": ["allow_assistant_response", "audit"]
  },
  "identity_access_integrity": {
    "type": "identity_access_integrity_v1",
    "required_scopes": ["read:context", "write:response"],
    "expected_tenant_id": "tenant_assistant",
    "require_access_log": true
  },
  "operational_integrity": {
    "type": "operational_integrity_v1",
    "expected_status": "success",
    "max_latency_ms": 3500,
    "require_no_runtime_error": true
  },
  "model_identity_integrity": {
    "type": "model_identity_integrity_v1",
    "expected_model": "gpt-4.1-mini",
    "require_exact_match": true
  },
  "retrieval_integrity": {
    "type": "retrieval_integrity_v1",
    "expected_sources": ["policy_wiki", "customer_kb"],
    "min_sources": 1
  },
  "deterministic_integrity": {
    "type": "deterministic_integrity_v1",
    "expected_digest": "assistant_expected_digest",
    "algorithm": "sha256",
    "require_exact_match": true
  },
  "cross_system_integrity": {
    "type": "cross_system_integrity_v1",
    "expected_systems": ["gateway", "policy_engine", "llm_runtime"],
    "require_all_systems": true
  }
}
```

## Example template 2 — API/service

```json
{
  "policy_integrity": {
    "type": "policy_integrity_v1",
    "required_tags": ["allow_api_call"]
  },
  "identity_access_integrity": {
    "type": "identity_access_integrity_v1",
    "required_scopes": ["read:api"],
    "require_access_log": true
  },
  "operational_integrity": {
    "type": "operational_integrity_v1",
    "expected_status": "success",
    "max_latency_ms": 1200,
    "require_no_runtime_error": true
  },
  "model_identity_integrity": {
    "type": "model_identity_integrity_v1",
    "expected_model": "n/a-api-service",
    "require_exact_match": false
  },
  "retrieval_integrity": {
    "type": "retrieval_integrity_v1",
    "expected_sources": ["service_db"],
    "min_sources": 1
  },
  "deterministic_integrity": {
    "type": "deterministic_integrity_v1",
    "expected_digest": "service_expected_digest",
    "algorithm": "sha256",
    "require_exact_match": true
  },
  "cross_system_integrity": {
    "type": "cross_system_integrity_v1",
    "expected_systems": ["api_gateway", "service_core", "audit_log"],
    "require_all_systems": true
  }
}
```

## Example template 3 — secure/internal system

```json
{
  "policy_integrity": {
    "type": "policy_integrity_v1",
    "required_tags": ["allow_internal_access", "sensitive"]
  },
  "identity_access_integrity": {
    "type": "identity_access_integrity_v1",
    "required_scopes": ["read:internal", "write:internal"],
    "expected_tenant_id": "tenant_internal",
    "require_access_log": true
  },
  "operational_integrity": {
    "type": "operational_integrity_v1",
    "expected_status": "success",
    "max_latency_ms": 800,
    "require_no_runtime_error": true
  },
  "model_identity_integrity": {
    "type": "model_identity_integrity_v1",
    "expected_model": "secure-internal-model",
    "require_exact_match": true
  },
  "retrieval_integrity": {
    "type": "retrieval_integrity_v1",
    "expected_sources": ["internal_kms", "internal_registry"],
    "min_sources": 2
  },
  "deterministic_integrity": {
    "type": "deterministic_integrity_v1",
    "expected_digest": "internal_expected_digest",
    "algorithm": "sha256",
    "require_exact_match": true
  },
  "cross_system_integrity": {
    "type": "cross_system_integrity_v1",
    "expected_systems": ["auth_service", "policy_service", "ledger"],
    "require_all_systems": true
  }
}
```

/**
 * Baseline-complete payload shapes for demo / live “clean control” scenarios.
 * Aligns with `deriveAllAngleBaselines` required field paths in baseline-registry.ts.
 */

import type { RailType } from "../protocol/angle-applicability.js";

export type JsonObject = Record<string, unknown>;

/** System rail + action_completed (or policy_checked): all seven angle baseline paths satisfied from payload + trace_id. */
export function cleanSystemControlPayload(overrides: JsonObject = {}): JsonObject {
  return {
    host: "demo-control",
    record_id: "demo-system-record",
    name: "ehr-suite",
    policy: { tags: ["allow_read"], version: "v1" },
    system: { rails: ["ehr", "queue", "llm", "audit"] },
    identity_access: {
      actor_id: "actor-demo-001",
      role: "clinical_integrator",
      principal_id: "actor-demo-001",
      granted_scopes: ["read:proofs"],
      scopes: ["read:proofs"],
      tenant_id: "tenant_demo",
      access_log_present: true,
      token_valid: true,
      token_expired: false,
    },
    operational: { execution_status: "success", latency_ms: 120, runtime_error: null },
    model_identity: { observed_model: "gpt-4.1-mini" },
    retrieval: { retrieved_sources: ["db", "cache"] },
    deterministic: { observed_digest: "stable-demo-digest-v1", temperature: 0 },
    workflow: { stage: "commit" },
    cross_system: { observed_systems: ["ehr", "queue", "llm"] },
    sync_id: "sync-demo-001",
    correlation_id: "corr-system-demo",
    ...overrides,
  };
}

/** Service rail + policy_checked. */
export function cleanServicePolicyCheckedPayload(overrides: JsonObject = {}): JsonObject {
  return {
    host: "demo-service",
    record_id: "demo-service-record",
    policy: { tags: ["allow_read"], rules: ["pii_scan", "audit_log"] },
    service_id: "svc-demo-001",
    identity_access: {
      principal_id: "svc-demo-001",
      principal_type: "service",
      granted_scopes: ["read:api"],
      api_key: "ak_live_demo_masked",
      token_valid: true,
      token_expired: false,
      access_log_present: true,
    },
    operational: { execution_status: "success", latency_ms: 95, runtime_error: null },
    model_identity: { observed_model: "gpt-4.1-mini" },
    retrieval: {
      retrieved_sources: ["postgres", "redis", "vendor-api"],
      declared_dependencies: ["postgres", "redis"],
      external_lookup: ["vendor-api"],
    },
    cross_system: { observed_systems: ["api_gateway", "service_core", "audit_log"] },
    deterministic: { observed_digest: "svc-stable-digest-v1" },
    operation_type: "read",
    request_id: "req-demo-001",
    dependency_id: "dep-queue-001",
    correlation_id: "corr-svc-demo",
    ...overrides,
  };
}

/** Model rail + policy_checked: all seven angle baseline paths satisfied. */
export function cleanModelPolicyCheckedPayload(overrides: JsonObject = {}): JsonObject {
  return {
    host: "demo-model",
    record_id: "demo-model-record",
    policy: { tags: ["allow_read"], version: "v1" },
    model_id: "model-demo-001",
    provider: "demo-provider",
    org_id: "org-demo",
    identity_access: {
      principal_id: "model-demo-001",
      principal_type: "model",
      granted_scopes: ["read:context"],
      token_valid: true,
      token_expired: false,
      access_log_present: false,
    },
    operational: { latency_ms: 52, execution_status: "success", runtime_error: null },
    model_identity: { observed_model: "reader-v2", version: "2.1" },
    retrieval: { retrieved_sources: ["vector", "search"], declared: true, tool_usage: ["vector", "search"] },
    deterministic: { observed_digest: "model-digest-v1", temperature: 0 },
    cross_system: { observed_systems: ["gateway", "policy_engine"] },
    correlation_id: "corr-model-demo",
    ...overrides,
  };
}

/** Agent rail + policy_checked. */
export function cleanAgentPolicyCheckedPayload(overrides: JsonObject = {}): JsonObject {
  return {
    host: "demo-agent",
    record_id: "demo-agent-record",
    policy: { tags: ["allow_read"] },
    operational: { execution_status: "success", latency_ms: 180, runtime_error: null },
    agent_id: "agent-demo-001",
    identity_access: {
      principal_id: "agent-demo-001",
      principal_type: "agent",
      granted_scopes: ["read:proofs", "tool:search"],
      scopes: ["read:proofs", "tool:search"],
      token_valid: true,
      token_expired: false,
      access_log_present: true,
    },
    agent: {
      allowed_actions: ["read", "search"],
      step_trace: ["plan", "act", "verify"],
      execution_state: "completed",
      decision_trace: ["branch-a"],
    },
    model_identity: { observed_model: "gpt-4.1-mini" },
    retrieval: { retrieved_sources: ["web", "kb-1"], tool_usage: ["web"], external_lookup: ["kb-1"] },
    deterministic: { observed_digest: "agent-digest-v1" },
    tool_invocation_id: "tool-inv-001",
    external_response_id: "ext-resp-001",
    cross_system: { observed_systems: ["tool_runtime", "agent_core"] },
    correlation_id: "corr-agent-demo",
    ...overrides,
  };
}

/** Endpoint rail + policy_checked. */
export function cleanEndpointPolicyCheckedPayload(overrides: JsonObject = {}): JsonObject {
  return {
    host: "demo-endpoint",
    record_id: "demo-endpoint-record",
    route: "/v1/chat",
    policy: { tags: ["allow_read"] },
    endpoint: {
      restrictions: ["no_pii_export"],
      connectivity_state: "online",
    },
    endpoint_id: "ep-demo-001",
    identity_access: {
      actor_id: "user-demo-001",
      principal_id: "user-demo-001",
      principal_type: "user",
      granted_scopes: ["ep:chat"],
      tenant_id: "tenant_demo",
      token_valid: true,
      token_expired: false,
      access_log_present: true,
    },
    operational: { execution_status: "success", latency_ms: 42, runtime_error: null },
    model_identity: { observed_model: "gpt-4.1-mini", version: "1.0" },
    retrieval: { retrieved_sources: ["cache", "api"], local_source: "cache", remote_source: "api" },
    cross_system: { observed_systems: ["edge", "origin"] },
    deterministic: { observed_digest: "ep-digest-v1" },
    request_type: "chat",
    sync_id: "sync-ep-001",
    upload_id: "upl-001",
    callback_id: "cb-001",
    correlation_id: "corr-ep-demo",
    ...overrides,
  };
}

/** Violates an auto-enabled angle for the rail (policy, operational, identity, or cross-system). */
export function demoFailurePayloadForRail(rail: RailType, overrides: JsonObject = {}): JsonObject {
  switch (rail) {
    case "model":
      return cleanModelPolicyCheckedPayload({
        policy: { tags: ["export_blocked"], version: "v1" },
        ...overrides,
      });
    case "agent": {
      const brk = cleanAgentPolicyCheckedPayload({
        policy: { tags: ["decision_denied"] },
        operational: { execution_status: "failure", latency_ms: 400, runtime_error: "planner_rejected" },
        ...overrides,
      }) as Record<string, unknown>;
      delete brk.tool_invocation_id;
      delete brk.external_response_id;
      return brk;
    }
    case "service":
      return cleanServicePolicyCheckedPayload({
        operational: { execution_status: "failure", latency_ms: 1200, runtime_error: "upstream_timeout" },
        deterministic: { observed_digest: "nondet-broken" },
        ...overrides,
      });
    case "endpoint":
      return cleanEndpointPolicyCheckedPayload({
        identity_access: {
          actor_id: "user-demo-001",
          principal_id: "user-demo-001",
          principal_type: "user",
          granted_scopes: ["ep:chat"],
          tenant_id: "tenant_demo",
          token_valid: false,
          token_expired: false,
          access_log_present: true,
        },
        ...overrides,
      });
    case "system":
    default:
      return cleanSystemControlPayload({
        cross_system: { observed_systems: ["llm"] },
        ...overrides,
      });
  }
}

/**
 * Second event in a version bump (same `event_lineage_id`, `event_version: 2`).
 * Default ingest maps to `action_completed`, so any angle with `angle_control.enabled` and an evaluator
 * for that event is evaluated. For `deterministic_integrity`, the evaluator compares `payload.deterministic.observed_digest`
 * to the effective baseline’s `expected_digest` (or unverifiable if shape/definition mismatch).
 * If a new release is supposed to report a *new* stable digest, update the `deterministic_integrity` row’s
 * `expected_digest` in the subject’s baseline (or a shape merge) — do not rely on a smaller demo payload
 * alone to “change reality” without a baseline update.
 * Sandbox version-progress scenarios therefore keep a baseline-matching digest for rails where
 * `deterministic_integrity` is auto-enabled (notably `service` and `endpoint`) so the latest snapshot stays conformant
 * when lineage events advance; other fields (correlation_id, interface_version, etc.) still carry the v2 story.
 */
export function demoVersionBumpSecondPayloadForRail(rail: RailType, overrides: JsonObject = {}): JsonObject {
  switch (rail) {
    case "model":
      return cleanModelPolicyCheckedPayload({
        model_identity: { observed_model: "reader-v2", version: "2.2" },
        deterministic: { observed_digest: "model-digest-v1", temperature: 0 },
        correlation_id: "corr-model-demo-v2",
        ...overrides,
      });
    case "agent":
      return cleanAgentPolicyCheckedPayload({
        agent: {
          allowed_actions: ["read", "search", "verify"],
          step_trace: ["plan", "act", "verify", "signoff"],
          execution_state: "verified",
          decision_trace: ["branch-a", "branch-confirm"],
        },
        deterministic: { observed_digest: "agent-digest-v1" },
        correlation_id: "corr-agent-demo-v2",
        ...overrides,
      });
    case "service":
      // Deterministic is auto-enabled for service; baseline + v1 use svc-stable-digest-v1. Keep the same digest
      // on the version bump so governed lineage (lineage_id / version) can advance without a false "drift" fail.
      return cleanServicePolicyCheckedPayload({
        service_id: "svc-demo-001",
        operational: { execution_status: "success", latency_ms: 88, runtime_error: null },
        deterministic: { observed_digest: "svc-stable-digest-v1" },
        correlation_id: "corr-svc-demo-v2",
        ...overrides,
      });
    case "endpoint":
      // Same: deterministic is auto-enabled for endpoint; v2 must still match the merged baseline (ep-digest-v1).
      return cleanEndpointPolicyCheckedPayload({
        route: "/v1/chat",
        endpoint: { restrictions: ["no_pii_export"], connectivity_state: "online", interface_version: "2026-04" },
        deterministic: { observed_digest: "ep-digest-v1" },
        correlation_id: "corr-ep-demo-v2",
        ...overrides,
      });
    case "system":
    default:
      return cleanSystemControlPayload({
        workflow: { stage: "verify" },
        policy: { tags: ["allow_read"], version: "v2" },
        deterministic: { observed_digest: "stable-demo-digest-v1", temperature: 0 },
        correlation_id: "corr-system-demo-v2",
        ...overrides,
      });
  }
}

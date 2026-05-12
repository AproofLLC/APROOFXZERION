/**
 * Baseline-complete payload shapes for demo / live “clean control” scenarios.
 * Aligns with `deriveAllAngleBaselines` required field paths in baseline-registry.ts.
 */

import type { RailType } from "../protocol/angle-applicability.js";
import { ZERION_ADAPTER_RUNTIME_ERROR } from "../zerion/zerion-execution-adapter.js";

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

/** Policy tags required for Zerion Agent sandbox baselines (`policy_integrity_v1.required_tags`). */
export const ZERION_AGENT_DEMO_POLICY_TAGS = [
  "allow_read",
  "chain_solana_devnet",
  "scoped_policy_pass",
  "no_god_mode",
  "assets_approved",
] as const;

export function readZerionMaxSpendUsdFromEnv(): number {
  const raw = process.env.ZERION_MAX_SPEND_USD;
  const n = raw != null && raw.trim() !== "" ? Number(raw) : 5;
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

export function readZerionApprovedAssetsFromEnv(): string[] {
  const raw = process.env.ZERION_APPROVED_ASSETS ?? "SOL,USDC";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function readZerionAllowedChainFromEnv(): string {
  return (process.env.ZERION_ALLOWED_CHAIN ?? "solana-devnet").trim() || "solana-devnet";
}

const ZERION_ARCHITECTURE =
  "Zerion Agent uses the forked Zerion CLI for real onchain execution while AProof evaluates every proposed and completed action through scoped policies, deterministic proof generation, failure localization, and Solana devnet anchoring.";

/**
 * Zerion Agent demo: agent rail payload with scoped-policy, CLI/API, and devnet execution metadata.
 */
export function cleanZerionAgentDemoPayload(overrides: JsonObject = {}): JsonObject {
  const maxSpend = readZerionMaxSpendUsdFromEnv();
  const assets = readZerionApprovedAssetsFromEnv();
  const chain = readZerionAllowedChainFromEnv();
  const integrationReady = false;
  const agentWallet = process.env.ZERION_AGENT_WALLET_ADDRESS?.trim() ?? "";
  return cleanAgentPolicyCheckedPayload({
    event_type: "agent_execution_completed",
    host: "zerion-agent-demo",
    record_id: "zerion-agent-record",
    track_context: "Zerion CLI autonomous onchain agent",
    architecture: ZERION_ARCHITECTURE,
    policy: {
      tags: [...ZERION_AGENT_DEMO_POLICY_TAGS],
      version: "v1",
      policy_expiry_window_hours: 24,
      policy_result: "approved",
    },
    zerion: {
      cli_fork: "zerion-cli-fork",
      api_routing: true,
      allowed_chain: chain,
      chain,
      action: "transfer_or_swap",
      max_spend_usd: maxSpend,
      amount_usd: 1,
      approved_assets: assets,
      policy_expiry_window_hours: 24,
      god_mode: false,
      scoped_policy_pass: true,
      execution_requires_policy_pass: true,
      integration_ready: integrationReady,
      execution_simulated: false,
      wallet_address: agentWallet,
      aproof_event_ingested: true,
    },
    cross_system: {
      observed_systems: ["zerion_cli_fork", "zerion_api", "solana_devnet", "aproof_ingest"],
    },
    correlation_id: "corr-zerion-agent-demo",
    ...overrides,
  });
}

/**
 * Blocked / failed execution path: operational_integrity violated with a deterministic `runtime_error` code
 * (surfaced as `reason_code` when it matches `OPERATIONAL_ZERION_DETAIL_REASON_CODES`).
 */
export function zerionAgentExecutionBlockedPayload(
  reasonCode: string,
  integrationReady: boolean,
  overrides: JsonObject = {},
): JsonObject {
  const { zerion: zerionOverride, ...restOverrides } = overrides;
  const zerionPatch =
    zerionOverride && typeof zerionOverride === "object" && !Array.isArray(zerionOverride)
      ? (zerionOverride as JsonObject)
      : {};
  const maxSpend = readZerionMaxSpendUsdFromEnv();
  const assets = readZerionApprovedAssetsFromEnv();
  const chain = readZerionAllowedChainFromEnv();
  const cliFailureCodes = new Set<string>([
    ZERION_ADAPTER_RUNTIME_ERROR.CLI_EXECUTION_FAILED,
    ZERION_ADAPTER_RUNTIME_ERROR.TX_HASH_MISSING,
    ZERION_ADAPTER_RUNTIME_ERROR.CLI_TIMEOUT,
    ZERION_ADAPTER_RUNTIME_ERROR.CLI_INVALID_OUTPUT,
    ZERION_ADAPTER_RUNTIME_ERROR.CLI_PATH_INVALID,
    "ZERION_CLI_TX_HASH_MISSING",
    "ZERION_TX_HASH_MISSING",
    "ZERION_CLI_SPAWN_FAILED",
  ]);
  const cliInvoked = cliFailureCodes.has(reasonCode);
  const executionAttempted = cliInvoked;
  const scopedPolicyPass = !String(reasonCode).startsWith("POLICY_");
  const policyResult = String(reasonCode).startsWith("POLICY_") ? "denied" : "approved";
  const agentWallet = process.env.ZERION_AGENT_WALLET_ADDRESS?.trim() ?? "";
  return cleanAgentPolicyCheckedPayload({
    event_type: "agent_execution_completed",
    host: "zerion-agent-demo",
    record_id: "zerion-agent-record",
    track_context: "Zerion CLI autonomous onchain agent",
    architecture: ZERION_ARCHITECTURE,
    policy: {
      tags: [...ZERION_AGENT_DEMO_POLICY_TAGS],
      version: "v1",
      policy_expiry_window_hours: 24,
      policy_result: policyResult,
    },
    operational: {
      execution_status: "failure",
      latency_ms: 1,
      runtime_error: reasonCode,
    },
    zerion: {
      cli_fork: "zerion-cli-fork",
      api_routing: true,
      allowed_chain: chain,
      chain,
      action: "transfer_or_swap",
      max_spend_usd: maxSpend,
      amount_usd: 1,
      approved_assets: assets,
      policy_expiry_window_hours: 24,
      god_mode: false,
      scoped_policy_pass: scopedPolicyPass,
      execution_requires_policy_pass: true,
      integration_ready: integrationReady,
      execution_simulated: false,
      execution_attempted: executionAttempted,
      cli_invoked: cliInvoked,
      execution_source: cliInvoked ? "zerion_cli" : "none",
      proposed_spend_usd: 1,
      proposed_asset: "SOL",
      wallet_address: agentWallet,
      aproof_event_ingested: true,
      ...zerionPatch,
    },
    cross_system: {
      observed_systems: [
        "zerion_cli_fork",
        "zerion_api",
        "solana_devnet",
        "aproof_ingest",
        "aproof_policy_gate",
      ],
    },
    correlation_id: "corr-zerion-agent-blocked",
    ...restOverrides,
  });
}

/** Scenario 2: intentional scoped policy violation — no Zerion CLI invocation. */
export function zerionAgentDemoPolicyFailurePayload(overrides: JsonObject = {}): JsonObject {
  const maxSpend = readZerionMaxSpendUsdFromEnv();
  return zerionAgentExecutionBlockedPayload("POLICY_SPEND_LIMIT_EXCEEDED", false, {
    zerion: {
      proposed_spend_usd: maxSpend + 1,
      proposed_asset: "SOL",
      cli_invoked: false,
      execution_attempted: false,
      execution_source: "none",
      tx_hash: null,
    },
    ...overrides,
  });
}

/** After real CLI execution: include on-chain signature and wallet metadata. */
export function zerionAgentPostCliSuccessPayload(params: {
  tx_hash: string;
  wallet_address: string;
  recipient_address?: string | null;
  chain: string;
  amount_usd: number;
  asset: string;
  integration_ready: boolean;
  correlation_id?: string;
  policy_version?: string;
  policy_bundle_version?: string | null;
  execution_source?: string;
  execution_simulated?: boolean;
  /** Merged into `zerion` without dropping tx_hash / execution metadata. */
  zerion_extra?: JsonObject;
  overrides?: JsonObject;
}): JsonObject {
  const o = params.overrides ?? {};
  const execSource =
    typeof params.execution_source === "string" && params.execution_source.trim() !== ""
      ? params.execution_source.trim()
      : "zerion_cli";
  const zerionBase: JsonObject = {
    cli_fork: "zerion-cli-fork",
    api_routing: true,
    allowed_chain: params.chain,
    chain: params.chain,
    action: "transfer_or_swap",
    max_spend_usd: readZerionMaxSpendUsdFromEnv(),
    approved_assets: readZerionApprovedAssetsFromEnv(),
    tx_hash: params.tx_hash,
    wallet_address: params.wallet_address,
    recipient_address: params.recipient_address ?? undefined,
    amount_usd: params.amount_usd,
    asset: params.asset,
    execution_source: execSource,
    cli_invoked: true,
    execution_attempted: true,
    integration_ready: params.integration_ready,
    execution_simulated: params.execution_simulated === true,
    scoped_policy_pass: true,
    god_mode: false,
    execution_requires_policy_pass: true,
    policy_bundle_version: params.policy_bundle_version ?? undefined,
    aproof_event_ingested: true,
    ...(params.zerion_extra ?? {}),
  };
  return cleanAgentPolicyCheckedPayload({
    event_type: "agent_execution_completed",
    host: "zerion-agent-demo",
    record_id: "zerion-agent-record",
    track_context: "Zerion CLI autonomous onchain agent",
    architecture: ZERION_ARCHITECTURE,
    policy: {
      tags: [...ZERION_AGENT_DEMO_POLICY_TAGS],
      version: params.policy_version ?? "v1",
      policy_expiry_window_hours: 24,
      policy_result: "approved",
    },
    operational: { execution_status: "success", latency_ms: 120, runtime_error: null },
    zerion: zerionBase,
    cross_system: {
      observed_systems: ["zerion_cli_fork", "zerion_api", "solana_devnet", "aproof_ingest"],
    },
    correlation_id: params.correlation_id ?? "corr-zerion-agent-cli",
    ...o,
  });
}

/** Second event for Zerion Agent lineage version bump (same digest; context/policy bundle advances). */
export function zerionAgentDemoVersionBumpSecondPayload(overrides: JsonObject = {}): JsonObject {
  const chain = readZerionAllowedChainFromEnv();
  const agentWallet = process.env.ZERION_AGENT_WALLET_ADDRESS?.trim() ?? "";
  return cleanZerionAgentDemoPayload({
    agent: {
      allowed_actions: ["read", "search", "verify"],
      step_trace: ["plan", "policy_gate", "zerion_cli", "verify"],
      execution_state: "verified",
      decision_trace: ["branch-a", "branch-confirm"],
    },
    policy: {
      tags: [...ZERION_AGENT_DEMO_POLICY_TAGS],
      version: "v2",
      policy_expiry_window_hours: 24,
      policy_result: "approved",
    },
    zerion: {
      cli_fork: "zerion-cli-fork",
      api_routing: true,
      allowed_chain: chain,
      chain,
      action: "transfer_or_swap",
      wallet_address: agentWallet,
      max_spend_usd: readZerionMaxSpendUsdFromEnv(),
      amount_usd: 1,
      approved_assets: readZerionApprovedAssetsFromEnv(),
      policy_expiry_window_hours: 48,
      god_mode: false,
      scoped_policy_pass: true,
      execution_requires_policy_pass: true,
      integration_ready: false,
      execution_simulated: false,
      aproof_event_ingested: true,
      policy_bundle_version: "2026-05-09b",
    },
    deterministic: { observed_digest: "agent-digest-v1" },
    correlation_id: "corr-zerion-agent-demo-v2",
    ...overrides,
  });
}

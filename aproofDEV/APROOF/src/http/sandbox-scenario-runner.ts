import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  cleanModelPolicyCheckedPayload,
  cleanSystemControlPayload,
  readZerionAllowedChainFromEnv,
  readZerionMaxSpendUsdFromEnv,
  zerionAgentExecutionBlockedPayload,
  zerionAgentPostCliSuccessPayload,
} from "../demo/demo-clean-payloads.js";
import { evaluateZerionScopedPolicy } from "../zerion/zerion-policy-gate.js";
import { buildZerionReadinessSnapshot } from "../zerion/zerion-readiness.js";
import { runZerionCliExecution, ZERION_ADAPTER_RUNTIME_ERROR } from "../zerion/zerion-execution-adapter.js";
import type { ZerionContinuityRecipientResolution } from "../zerion/zerion-continuity-recipient.js";
import {
  resolveAuthorizedExecutionRecipientAddress,
  resolveZerionContinuityRecipient,
} from "../zerion/zerion-continuity-recipient.js";
import { effectiveZerionAgentWallet } from "../zerion/zerion-local-defaults.js";
import { applyZerionAgentDemoBaselineShapes } from "../demo/sandbox-rail-baseline-shapes.js";
import { processEvent } from "../pipeline/process-event.js";
import { baselines, canonicalEvents, subjects } from "../db/schema/index.js";
import type { PostEventBody } from "./events-schema.js";
import type { RailType } from "../protocol/angle-applicability.js";
import { APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY, createSubject } from "./subject-service.js";
import { sandboxScopedUuid } from "./sandbox-deterministic-uuid.js";
import { runSandboxAnchorCoordinatorForSubject } from "../anchor/sandbox-anchor-coordinator.js";

export const SANDBOX_SCENARIO_TEMPLATES = [
  "clean_first_proof",
  "mixed_pass_fail",
  "baseline_gap",
  "identity_mismatch",
  "policy_violation",
  "lineage_version_bump",
  /** Model rail + real `cleanModelPolicyCheckedPayload` through normal ingest. */
  "governed_model_response",
  /**
   * Zerion Agent single-subject demo (template id unchanged for API compatibility).
   * Active sandbox seeds one agent subject; scenarios exercise clean / policy fail / lineage version.
   */
  "demo_all_rails",
] as const;

export type SandboxScenarioTemplate = (typeof SANDBOX_SCENARIO_TEMPLATES)[number];

export function isSandboxScenarioTemplate(v: string): v is SandboxScenarioTemplate {
  return (SANDBOX_SCENARIO_TEMPLATES as readonly string[]).includes(v);
}

const DEMO_TEMPLATE: SandboxScenarioTemplate = "demo_all_rails";

function zerionAgentExternalKey(): string {
  const v = process.env.APROOF_SUBJECT_ID?.trim();
  return v && v.length > 0 ? v : "zerion-agent";
}

/** Deterministic UUID for the sole Zerion Agent sandbox subject (internal `subject_id`). */
export function demoZerionAgentSubjectId(environmentId: string): string {
  return sandboxScopedUuid(environmentId, DEMO_TEMPLATE, "subject-zerion-agent");
}

export type DemoSandboxAction = "clean_proof" | "failure" | "version_update";

export type SandboxBootstrapResult = {
  template: SandboxScenarioTemplate;
  primary_subject_id: string;
  subject_ids: string[];
  /** Single-key map for cache hydration (`agent` rail only). */
  subject_ids_by_rail?: Record<string, string>;
};

const DEFAULT_SOURCE = APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY;

function baseTime(iso: string): Date {
  return new Date(iso);
}

function eventBody(
  organizationId: string,
  environmentId: string,
  subjectId: string,
  traceId: string,
  occurredAtIso: string,
  payload: Record<string, unknown>,
  opts?: { event_lineage_id?: string; event_version?: number },
): PostEventBody {
  return {
    organization_id: organizationId,
    environment_id: environmentId,
    subject_id: subjectId,
    source_type_key: DEFAULT_SOURCE,
    trace_id: traceId,
    occurred_at: baseTime(occurredAtIso),
    payload,
    ...(opts?.event_lineage_id ? { event_lineage_id: opts.event_lineage_id } : {}),
    ...(opts?.event_version !== undefined ? { event_version: opts.event_version } : {}),
  };
}

async function ingest(db: Db, body: PostEventBody): Promise<void> {
  const r = await processEvent(db, body);
  if (!r.ok) {
    throw new Error(`sandbox ingest failed: ${r.reason}`);
  }
  await runSandboxAnchorCoordinatorForSubject(db, {
    subjectId: body.subject_id,
    organizationId: body.organization_id,
    environmentId: body.environment_id,
  });
}

async function nextTargetedDemoSequence(
  db: Db,
  params: { organizationId: string; environmentId: string; subjectId: string },
): Promise<number> {
  const rows = await db
    .select({ eventId: canonicalEvents.eventId })
    .from(canonicalEvents)
    .where(
      and(
        eq(canonicalEvents.organizationId, params.organizationId),
        eq(canonicalEvents.environmentId, params.environmentId),
        eq(canonicalEvents.subjectId, params.subjectId),
      ),
    );
  return rows.length + 1;
}

/** Wall-clock time for demo ingests so the UI shows “now”. */
function demoLiveOccurredAtIso(ordinalSeconds = 0): string {
  return new Date(Date.now() + ordinalSeconds * 1000).toISOString();
}

const ZERION_DEMO_SPEND_USD = 1;
const ZERION_DEMO_ASSET = "SOL";

function demoPolicyValidUntilIso(occurredAt: Date): string {
  return new Date(occurredAt.getTime() + 100 * 3600 * 1000).toISOString();
}

function mapZerionCliFailureReason(runtimeError: string): string {
  const known = new Set<string>(Object.values(ZERION_ADAPTER_RUNTIME_ERROR));
  if (known.has(runtimeError)) return runtimeError;
  return ZERION_ADAPTER_RUNTIME_ERROR.CLI_EXECUTION_FAILED;
}

function debugZerionRecipient(stage: string, value: string | null | undefined): void {
  if (process.env.APROOF_DEBUG_ZERION_RECIPIENT === "1") {
    process.stderr.write(`[zerion-recipient] stage=${stage} recipient=${value?.trim() || "null"}\n`);
  }
}

/**
 * Policy gate → integration readiness → forked Zerion CLI (when ready).
 * Does not ingest conformant “clean” Zerion success without a real `tx_hash` from the adapter.
 */
async function buildZerionAgentScenarioPayload(params: {
  occurredAt: Date;
  mode: "clean" | "failure" | "continuity_v1" | "version_v2";
}): Promise<Record<string, unknown>> {
  const snap = await buildZerionReadinessSnapshot();
  const validUntil = demoPolicyValidUntilIso(params.occurredAt);

  if (params.mode === "failure") {
    const allowedChain = readZerionAllowedChainFromEnv();
    const maxSpend = readZerionMaxSpendUsdFromEnv();
    const gate = evaluateZerionScopedPolicy({
      intended_chain: allowedChain,
      spend_usd: maxSpend + 1,
      asset: ZERION_DEMO_ASSET,
      god_mode: false,
      occurred_at: params.occurredAt,
      policy_valid_until_iso: validUntil,
    });
    if (gate.ok) {
      throw new Error("sandbox Zerion failure scenario expected policy gate deny");
    }
    return zerionAgentExecutionBlockedPayload(gate.reason_code, snap.integration_ready, {
      zerion: {
        proposed_spend_usd: maxSpend + 1,
        amount_usd: maxSpend + 1,
        cli_invoked: false,
        execution_attempted: false,
        execution_source: "none",
        tx_hash: null,
      },
    }) as Record<string, unknown>;
  }

  const allowedChain = readZerionAllowedChainFromEnv();
  const gate = evaluateZerionScopedPolicy({
    intended_chain: allowedChain,
    spend_usd: ZERION_DEMO_SPEND_USD,
    asset: ZERION_DEMO_ASSET,
    god_mode: false,
    occurred_at: params.occurredAt,
    policy_valid_until_iso: validUntil,
  });
  if (!gate.ok) {
    return zerionAgentExecutionBlockedPayload(gate.reason_code, snap.integration_ready) as Record<string, unknown>;
  }

  if (!snap.integration_ready) {
    return zerionAgentExecutionBlockedPayload("ZERION_INTEGRATION_NOT_READY", false, {
      zerion: { cli_invoked: false, execution_attempted: false, execution_source: "none" },
    }) as Record<string, unknown>;
  }

  let continuityRecipient: ZerionContinuityRecipientResolution | null = null;
  let executionRecipient: string;
  if (params.mode === "clean") {
    executionRecipient = resolveAuthorizedExecutionRecipientAddress().recipient_address;
    debugZerionRecipient("scenario_authorized", executionRecipient);
  } else if (params.mode === "continuity_v1" || params.mode === "version_v2") {
    continuityRecipient = resolveZerionContinuityRecipient();
    executionRecipient = continuityRecipient.recipient_address;
    debugZerionRecipient("scenario_continuity", executionRecipient);
  } else {
    throw new Error("sandbox Zerion execution branch: unexpected mode");
  }
  const exec = await runZerionCliExecution({
    amount_usd: ZERION_DEMO_SPEND_USD,
    asset: ZERION_DEMO_ASSET,
    chain: allowedChain,
    recipient_address: executionRecipient,
    scenario: params.mode === "clean" ? "authorized_execution" : "execution_continuity",
  });
  debugZerionRecipient("adapter_returned", exec.ok ? exec.recipient_address : null);
  if (!exec.ok) {
    const reason = mapZerionCliFailureReason(exec.runtime_error);
    return zerionAgentExecutionBlockedPayload(reason, snap.integration_ready, {
      zerion: {
        cli_invoked: exec.cli_invoked,
        execution_attempted: exec.execution_attempted,
        execution_source: exec.execution_source,
      },
    }) as Record<string, unknown>;
  }

  const wallet = effectiveZerionAgentWallet(process.env);
  if (params.mode === "version_v2") {
    if (!continuityRecipient) throw new Error("internal: continuity recipient required for version_v2");
    return zerionAgentPostCliSuccessPayload({
      tx_hash: exec.tx_hash,
      wallet_address: wallet,
      recipient_address: exec.recipient_address ?? continuityRecipient.recipient_address,
      chain: allowedChain,
      amount_usd: ZERION_DEMO_SPEND_USD,
      asset: ZERION_DEMO_ASSET,
      integration_ready: snap.integration_ready,
      execution_source: exec.execution_source,
      execution_simulated: exec.execution_simulated,
      policy_version: "v2",
      policy_bundle_version: "2026-05-09b",
      correlation_id: "corr-zerion-agent-demo-v2",
      zerion_extra: { policy_expiry_window_hours: 48 },
      overrides: {
        agent: {
          allowed_actions: ["read", "search", "verify"],
          step_trace: ["plan", "policy_gate", "zerion_cli", "verify"],
          execution_state: "verified",
          decision_trace: ["branch-a", "branch-confirm"],
        },
        policy: {
          tags: [
            "allow_read",
            "chain_solana_devnet",
            "scoped_policy_pass",
            "no_god_mode",
            "assets_approved",
          ],
          version: "v2",
          policy_expiry_window_hours: 24,
        },
        deterministic: { observed_digest: "agent-digest-v1" },
      },
    }) as Record<string, unknown>;
  }

  return zerionAgentPostCliSuccessPayload({
    tx_hash: exec.tx_hash,
    wallet_address: wallet,
    recipient_address: exec.recipient_address ?? executionRecipient,
    chain: allowedChain,
    amount_usd: ZERION_DEMO_SPEND_USD,
    asset: ZERION_DEMO_ASSET,
    integration_ready: snap.integration_ready,
    execution_source: exec.execution_source,
    execution_simulated: exec.execution_simulated,
    correlation_id: "corr-zerion-agent-cli",
  }) as Record<string, unknown>;
}

function buildZerionAgentDemoBootstrap(environmentId: string): SandboxBootstrapResult {
  const subjectId = demoZerionAgentSubjectId(environmentId);
  return {
    template: DEMO_TEMPLATE,
    primary_subject_id: subjectId,
    subject_ids: [subjectId],
    subject_ids_by_rail: { agent: subjectId },
  };
}

async function seedZerionAgentDemoSubject(
  db: Db,
  organizationId: string,
  environmentId: string,
): Promise<string> {
  const subjectId = demoZerionAgentSubjectId(environmentId);
  const existing = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.id, subjectId),
        eq(subjects.organizationId, organizationId),
        eq(subjects.environmentId, environmentId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    await createSubject(db, {
      organizationId,
      environmentId,
      railType: "agent",
      subjectId,
      externalKey: zerionAgentExternalKey(),
    });
  }
  await applyZerionAgentDemoBaselineShapes(db, {
    organizationId,
    environmentId,
    subjectId,
  });
  return subjectId;
}

async function runFullZerionAgentDemo(
  db: Db,
  organizationId: string,
  environmentId: string,
): Promise<SandboxBootstrapResult> {
  await seedZerionAgentDemoSubject(db, organizationId, environmentId);
  return buildZerionAgentDemoBootstrap(environmentId);
}

async function runTargetedZerionAgentDemoAction(
  db: Db,
  organizationId: string,
  environmentId: string,
  demo_action: DemoSandboxAction,
): Promise<SandboxBootstrapResult> {
  const subjectId = await seedZerionAgentDemoSubject(db, organizationId, environmentId);

  const sequence = await nextTargetedDemoSequence(db, { organizationId, environmentId, subjectId });
  const lineageId = sandboxScopedUuid(environmentId, DEMO_TEMPLATE, `lineage-zerion-${demo_action}-${sequence}`);

  switch (demo_action) {
    case "clean_proof": {
      const occurredAt = new Date(demoLiveOccurredAtIso());
      const payload = await buildZerionAgentScenarioPayload({ occurredAt, mode: "clean" });
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${DEMO_TEMPLATE}-zerion-replay-clean-${sequence}`,
          occurredAt.toISOString(),
          payload,
          { event_lineage_id: lineageId, event_version: 1 },
        ),
      );
      break;
    }
    case "failure": {
      const occurredAt = new Date(demoLiveOccurredAtIso());
      const payload = await buildZerionAgentScenarioPayload({ occurredAt, mode: "failure" });
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${DEMO_TEMPLATE}-zerion-fail-${sequence}`,
          occurredAt.toISOString(),
          payload,
          { event_lineage_id: lineageId, event_version: 1 },
        ),
      );
      break;
    }
    case "version_update": {
      const occurredV1 = new Date(demoLiveOccurredAtIso(0));
      const payloadV1 = await buildZerionAgentScenarioPayload({ occurredAt: occurredV1, mode: "continuity_v1" });
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${DEMO_TEMPLATE}-zerion-v1-${sequence}`,
          occurredV1.toISOString(),
          payloadV1,
          { event_lineage_id: lineageId, event_version: 1 },
        ),
      );
      const occurredV2 = new Date(demoLiveOccurredAtIso(1));
      const payloadV2 = await buildZerionAgentScenarioPayload({ occurredAt: occurredV2, mode: "version_v2" });
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${DEMO_TEMPLATE}-zerion-v2-${sequence}`,
          occurredV2.toISOString(),
          payloadV2,
          { event_lineage_id: lineageId, event_version: 2 },
        ),
      );
      break;
    }
    default:
      throw new Error(`unknown demo_action`);
  }

  return buildZerionAgentDemoBootstrap(environmentId);
}

export type RunSandboxScenarioParams = {
  organizationId: string;
  environmentId: string;
  template: SandboxScenarioTemplate;
  /** Appends one Zerion Agent scenario without wiping demo session state. */
  targeted?: { demo_action: DemoSandboxAction };
};

/**
 * Creates normal subjects + real POST /events-equivalent ingest via `processEvent`.
 * IDs are deterministic per (environmentId, template, role) for stable replay.
 */
export async function runSandboxScenario(
  db: Db,
  params: RunSandboxScenarioParams,
): Promise<SandboxBootstrapResult> {
  const { organizationId, environmentId, template } = params;

  if (params.targeted) {
    if (template !== DEMO_TEMPLATE) {
      throw new Error("targeted sandbox replay requires demo_all_rails template");
    }
    return runTargetedZerionAgentDemoAction(db, organizationId, environmentId, params.targeted.demo_action);
  }

  const sid = (part: string) => sandboxScopedUuid(environmentId, template, part);

  switch (template) {
    case "demo_all_rails":
      return runFullZerionAgentDemo(db, organizationId, environmentId);

    case "clean_first_proof": {
      const subjectId = sid("subject-a");
      await createSubject(db, {
        organizationId,
        environmentId,
        railType: "system",
        subjectId,
      });
      await ingest(
        db,
        eventBody(organizationId, environmentId, subjectId, `sb-${template}-t1`, demoLiveOccurredAtIso(), cleanSystemControlPayload()),
      );
      return { template, primary_subject_id: subjectId, subject_ids: [subjectId] };
    }

    case "mixed_pass_fail": {
      const goodId = sid("subject-good");
      const badId = sid("subject-bad");
      await createSubject(db, { organizationId, environmentId, railType: "system", subjectId: goodId });
      await createSubject(db, { organizationId, environmentId, railType: "system", subjectId: badId });
      await ingest(
        db,
        eventBody(organizationId, environmentId, goodId, `sb-${template}-ok`, demoLiveOccurredAtIso(0), cleanSystemControlPayload()),
      );
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          badId,
          `sb-${template}-bad`,
          demoLiveOccurredAtIso(1),
          cleanSystemControlPayload({
            policy: { tags: ["blocked"], version: "v1" },
          }),
        ),
      );
      return { template, primary_subject_id: goodId, subject_ids: [goodId, badId] };
    }

    case "baseline_gap": {
      const subjectId = sid("subject-a");
      await createSubject(db, { organizationId, environmentId, railType: "system", subjectId });
      await db
        .delete(baselines)
        .where(and(eq(baselines.subjectId, subjectId), eq(baselines.angle, "policy_integrity")));
      await ingest(
        db,
        eventBody(organizationId, environmentId, subjectId, `sb-${template}-t1`, demoLiveOccurredAtIso(), cleanSystemControlPayload()),
      );
      return { template, primary_subject_id: subjectId, subject_ids: [subjectId] };
    }

    case "identity_mismatch": {
      const subjectId = sid("subject-a");
      await createSubject(db, { organizationId, environmentId, railType: "system", subjectId });
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${template}-t1`,
          demoLiveOccurredAtIso(),
          cleanSystemControlPayload({
            identity_access: {
              actor_id: "actor-demo-001",
              role: "clinical_integrator",
              principal_id: "actor-demo-001",
              granted_scopes: ["read:proofs"],
              scopes: ["read:proofs"],
              tenant_id: "tenant_wrong",
              access_log_present: true,
              token_valid: true,
              token_expired: false,
            },
          }),
        ),
      );
      return { template, primary_subject_id: subjectId, subject_ids: [subjectId] };
    }

    case "policy_violation": {
      const subjectId = sid("subject-a");
      await createSubject(db, { organizationId, environmentId, railType: "system", subjectId });
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${template}-t1`,
          demoLiveOccurredAtIso(),
          cleanSystemControlPayload({ policy: { tags: ["export_denied"], version: "v1" } }),
        ),
      );
      return { template, primary_subject_id: subjectId, subject_ids: [subjectId] };
    }

    case "lineage_version_bump": {
      const subjectId = sid("subject-a");
      const lineageId = sid("lineage-root");
      await createSubject(db, { organizationId, environmentId, railType: "system", subjectId });
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${template}-v1`,
          demoLiveOccurredAtIso(0),
          cleanSystemControlPayload({ workflow: { stage: "commit" } }),
          { event_lineage_id: lineageId, event_version: 1 },
        ),
      );
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${template}-v2`,
          demoLiveOccurredAtIso(1),
          cleanSystemControlPayload({ workflow: { stage: "verify" } }),
          { event_lineage_id: lineageId, event_version: 2 },
        ),
      );
      return { template, primary_subject_id: subjectId, subject_ids: [subjectId] };
    }

    case "governed_model_response": {
      const subjectId = sid("subject-model");
      await createSubject(db, { organizationId, environmentId, railType: "model", subjectId });
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${template}-t1`,
          demoLiveOccurredAtIso(),
          cleanModelPolicyCheckedPayload(),
        ),
      );
      return { template, primary_subject_id: subjectId, subject_ids: [subjectId] };
    }
  }
}

export function isDemoSandboxAction(v: string): v is DemoSandboxAction {
  return v === "clean_proof" || v === "failure" || v === "version_update";
}

/** @deprecated Legacy multi-rail helper retained for non-demo test fixtures only. */
export function demoSandboxSubjectId(environmentId: string, rail: RailType): string {
  return sandboxScopedUuid(environmentId, DEMO_TEMPLATE, `subject-${rail}`);
}

/** @deprecated Legacy five-rail order — not used by the active Zerion Agent sandbox. */
export const DEMO_SUBJECT_RAIL_ORDER: readonly RailType[] = ["model", "agent", "service", "endpoint", "system"];

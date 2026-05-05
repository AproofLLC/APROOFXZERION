import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  cleanAgentPolicyCheckedPayload,
  cleanEndpointPolicyCheckedPayload,
  cleanModelPolicyCheckedPayload,
  cleanServicePolicyCheckedPayload,
  cleanSystemControlPayload,
  demoFailurePayloadForRail,
  demoVersionBumpSecondPayloadForRail,
} from "../demo/demo-clean-payloads.js";
import { applySandboxRailBaselineShapes } from "../demo/sandbox-rail-baseline-shapes.js";
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
  /** Five real subjects (all rails) in one testnet environment; primary entry for Demo Mode. */
  "demo_all_rails",
] as const;

export type SandboxScenarioTemplate = (typeof SANDBOX_SCENARIO_TEMPLATES)[number];

export function isSandboxScenarioTemplate(v: string): v is SandboxScenarioTemplate {
  return (SANDBOX_SCENARIO_TEMPLATES as readonly string[]).includes(v);
}

/** Rails seeded for `demo_all_rails`, in product display order. */
export const DEMO_SUBJECT_RAIL_ORDER: readonly RailType[] = [
  "model",
  "agent",
  "service",
  "endpoint",
  "system",
];

export type DemoSandboxAction = "clean_proof" | "failure" | "version_update";

export type SandboxBootstrapResult = {
  template: SandboxScenarioTemplate;
  primary_subject_id: string;
  subject_ids: string[];
  /** Present for `demo_all_rails` (full or targeted replay). */
  subject_ids_by_rail?: Record<string, string>;
};

const DEFAULT_SOURCE = APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY;

const DEMO_TEMPLATE: SandboxScenarioTemplate = "demo_all_rails";

function demoSubjectPart(rail: RailType): string {
  return `subject-${rail}`;
}

export function demoSandboxSubjectId(environmentId: string, rail: RailType): string {
  return sandboxScopedUuid(environmentId, DEMO_TEMPLATE, demoSubjectPart(rail));
}

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

/** Wall-clock time for demo ingests so the UI shows “now” (ordering uses `ordinalSeconds` for multi-event scenarios). */
function demoLiveOccurredAtIso(ordinalSeconds = 0): string {
  return new Date(Date.now() + ordinalSeconds * 1000).toISOString();
}

function cleanPayloadForRail(rail: RailType): Record<string, unknown> {
  switch (rail) {
    case "model":
      return cleanModelPolicyCheckedPayload();
    case "agent":
      return cleanAgentPolicyCheckedPayload();
    case "service":
      return cleanServicePolicyCheckedPayload();
    case "endpoint":
      return cleanEndpointPolicyCheckedPayload();
    case "system":
    default:
      return cleanSystemControlPayload();
  }
}

function buildDemoAllRailsBootstrap(environmentId: string): SandboxBootstrapResult {
  const subject_ids_by_rail: Record<string, string> = {};
  for (const rail of DEMO_SUBJECT_RAIL_ORDER) {
    subject_ids_by_rail[rail] = demoSandboxSubjectId(environmentId, rail);
  }
  return {
    template: DEMO_TEMPLATE,
    primary_subject_id: subject_ids_by_rail.model!,
    subject_ids: DEMO_SUBJECT_RAIL_ORDER.map((r) => subject_ids_by_rail[r]!),
    subject_ids_by_rail,
  };
}

async function seedDemoAllRailsSubject(
  db: Db,
  organizationId: string,
  environmentId: string,
  rail: RailType,
): Promise<void> {
  const subjectId = demoSandboxSubjectId(environmentId, rail);
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
      railType: rail,
      subjectId,
    });
  }
  await applySandboxRailBaselineShapes(db, {
    organizationId,
    environmentId,
    subjectId,
    rail,
  });
}

async function runFullDemoAllRails(
  db: Db,
  organizationId: string,
  environmentId: string,
): Promise<SandboxBootstrapResult> {
  for (const rail of DEMO_SUBJECT_RAIL_ORDER) {
    await seedDemoAllRailsSubject(db, organizationId, environmentId, rail);
  }
  return buildDemoAllRailsBootstrap(environmentId);
}

async function runTargetedDemoAction(
  db: Db,
  organizationId: string,
  environmentId: string,
  rail: RailType,
  demo_action: DemoSandboxAction,
): Promise<SandboxBootstrapResult> {
  const subjectId = demoSandboxSubjectId(environmentId, rail);
  await applySandboxRailBaselineShapes(db, {
    organizationId,
    environmentId,
    subjectId,
    rail,
  });

  const sequence = await nextTargetedDemoSequence(db, { organizationId, environmentId, subjectId });
  const lineageId = sandboxScopedUuid(environmentId, DEMO_TEMPLATE, `lineage-${rail}-${demo_action}-${sequence}`);

  switch (demo_action) {
    case "clean_proof":
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${DEMO_TEMPLATE}-${rail}-replay-clean-${sequence}`,
          demoLiveOccurredAtIso(),
          cleanPayloadForRail(rail),
          { event_lineage_id: lineageId, event_version: 1 },
        ),
      );
      break;
    case "failure":
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${DEMO_TEMPLATE}-${rail}-fail-${sequence}`,
          demoLiveOccurredAtIso(),
          demoFailurePayloadForRail(rail),
          { event_lineage_id: lineageId, event_version: 1 },
        ),
      );
      break;
    case "version_update":
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${DEMO_TEMPLATE}-${rail}-v1-${sequence}`,
          demoLiveOccurredAtIso(0),
          cleanPayloadForRail(rail),
          { event_lineage_id: lineageId, event_version: 1 },
        ),
      );
      await ingest(
        db,
        eventBody(
          organizationId,
          environmentId,
          subjectId,
          `sb-${DEMO_TEMPLATE}-${rail}-v2-${sequence}`,
          demoLiveOccurredAtIso(1),
          demoVersionBumpSecondPayloadForRail(rail),
          { event_lineage_id: lineageId, event_version: 2 },
        ),
      );
      break;
    default:
      throw new Error(`unknown demo_action`);
  }

  return buildDemoAllRailsBootstrap(environmentId);
}

export type RunSandboxScenarioParams = {
  organizationId: string;
  environmentId: string;
  template: SandboxScenarioTemplate;
  /** When set with `template: demo_all_rails`, appends one rail scenario without wiping demo session state. */
  targeted?: { rail: RailType; demo_action: DemoSandboxAction };
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
    return runTargetedDemoAction(db, organizationId, environmentId, params.targeted.rail, params.targeted.demo_action);
  }

  const sid = (part: string) => sandboxScopedUuid(environmentId, template, part);

  switch (template) {
    case "demo_all_rails":
      return runFullDemoAllRails(db, organizationId, environmentId);

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

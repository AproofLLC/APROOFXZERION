import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { baselines, mappingRules, subjects } from "../db/schema/index.js";
import type { AngleName, SubjectType } from "../product/product-proof.js";

const DEMO_ORG_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_ENV_ID = "22222222-2222-4222-8222-222222222222";

export const REAL_SUBJECT = {
  subject_id: "66666666-6666-4666-8666-666666666601",
  subject_type: "system" as const,
  org_id: DEMO_ORG_ID,
  environment_id: DEMO_ENV_ID,
  external_key: "real-system-investor-demo-001",
} as const;

export const REAL_SUBJECT_ANGLE_ORDER: readonly AngleName[] = [
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

export type AngleBaseline = {
  angle: AngleName;
  version: number;
  subject_type: SubjectType;
  required_inputs: string[];
  expectations: Record<string, unknown>;
  evaluation_rules: string[];
  evidence_requirements: string[];
};

export type BaselineContractEntry = AngleBaseline & {
  effective_from: string;
  definition: Record<string, unknown>;
};

export const REAL_SUBJECT_BASELINE_CONTRACT: readonly BaselineContractEntry[] = [
  {
    angle: "policy_integrity",
    version: 1,
    subject_type: "system",
    required_inputs: ["payload.policy.tags"],
    expectations: { required_tags: ["allow_read"] },
    evaluation_rules: ["require policy tags to include allow_read"],
    evidence_requirements: ["proof_unit.evidence_json.summary", "proof_unit.expected_json.required_tags"],
    effective_from: "2025-01-01T00:00:00.000Z",
    definition: {
      type: "policy_integrity_v1",
      required_tags: ["allow_read"],
    },
  },
  {
    angle: "identity_access_integrity",
    version: 1,
    subject_type: "system",
    required_inputs: ["payload.identity_access.scopes", "payload.identity_access.tenant_id"],
    expectations: { required_scopes: ["read:proofs"], expected_tenant_id: "tenant_demo" },
    evaluation_rules: ["require read:proofs scope and tenant match"],
    evidence_requirements: ["proof_unit.observed_json.scopes", "proof_unit.expected_json.required_scopes"],
    effective_from: "2020-01-01T00:00:00.000Z",
    definition: {
      type: "identity_access_integrity_v1",
      required_scopes: ["read:proofs"],
      expected_tenant_id: "tenant_demo",
      require_access_log: true,
    },
  },
  {
    angle: "operational_integrity",
    version: 1,
    subject_type: "system",
    required_inputs: ["payload.operational.execution_status", "payload.operational.latency_ms"],
    expectations: { expected_status: "success", max_latency_ms: 1500, require_no_runtime_error: true },
    evaluation_rules: ["execution_status == success", "latency_ms <= 1500", "runtime_error == null"],
    evidence_requirements: ["proof_unit.observed_json.execution_status", "proof_unit.observed_json.latency_ms"],
    effective_from: "2020-01-01T00:00:00.000Z",
    definition: {
      type: "operational_integrity_v1",
      expected_status: "success",
      max_latency_ms: 1500,
      require_no_runtime_error: true,
    },
  },
  {
    angle: "model_identity_integrity",
    version: 1,
    subject_type: "system",
    required_inputs: ["payload.model_identity.observed_model"],
    expectations: { expected_model: "gpt-4.1-mini", require_exact_match: true },
    evaluation_rules: ["observed_model must exactly match expected_model"],
    evidence_requirements: ["proof_unit.observed_json.observed_model", "proof_unit.expected_json.expected_model"],
    effective_from: "2020-01-01T00:00:00.000Z",
    definition: {
      type: "model_identity_integrity_v1",
      expected_model: "gpt-4.1-mini",
      require_exact_match: true,
    },
  },
  {
    angle: "retrieval_integrity",
    version: 1,
    subject_type: "system",
    required_inputs: ["payload.retrieval.retrieved_sources"],
    expectations: { expected_sources: ["db", "cache"], min_sources: 2 },
    evaluation_rules: ["at least 2 sources", "sources should contain db and cache"],
    evidence_requirements: ["proof_unit.observed_json.retrieved_sources"],
    effective_from: "2020-01-01T00:00:00.000Z",
    definition: {
      type: "retrieval_integrity_v1",
      expected_sources: ["db", "cache"],
      min_sources: 2,
    },
  },
  {
    angle: "deterministic_integrity",
    version: 1,
    subject_type: "system",
    required_inputs: ["payload.deterministic.observed_digest"],
    expectations: { expected_digest: "stable-demo-digest-v1", algorithm: "sha256", require_exact_match: true },
    evaluation_rules: ["observed_digest must exactly match expected_digest"],
    evidence_requirements: ["proof_unit.observed_json.observed_digest"],
    effective_from: "2020-01-01T00:00:00.000Z",
    definition: {
      type: "deterministic_integrity_v1",
      expected_digest: "stable-demo-digest-v1",
      algorithm: "sha256",
      require_exact_match: true,
    },
  },
  {
    angle: "cross_system_integrity",
    version: 1,
    subject_type: "system",
    required_inputs: ["payload.cross_system.observed_systems"],
    expectations: { expected_systems: ["ehr", "queue", "llm"], require_all_systems: true },
    evaluation_rules: ["all expected systems must be present"],
    evidence_requirements: ["proof_unit.observed_json.observed_systems"],
    effective_from: "2020-01-01T00:00:00.000Z",
    definition: {
      type: "cross_system_integrity_v1",
      expected_systems: ["ehr", "queue", "llm"],
      require_all_systems: true,
    },
  },
] as const;

export type EventOutcomeClass = "conformant" | "flagged" | "violated" | "insufficient_evidence";

export const REAL_SUBJECT_EVALUATION_MATRIX = {
  subject_type: REAL_SUBJECT.subject_type,
  angle_inputs: {
    policy_integrity: ["payload.policy.tags"],
    identity_access_integrity: ["payload.identity_access.scopes", "payload.identity_access.tenant_id"],
    operational_integrity: ["payload.operational.execution_status", "payload.operational.latency_ms"],
    model_identity_integrity: ["payload.model_identity.observed_model"],
    retrieval_integrity: ["payload.retrieval.retrieved_sources"],
    deterministic_integrity: ["payload.deterministic.observed_digest"],
    cross_system_integrity: ["payload.cross_system.observed_systems"],
  },
  event_expectations: {
    clean_action_completed: "verified" as EventOutcomeClass,
    baseline_missing_policy_checked: "flagged" as EventOutcomeClass,
    changed_state_version_bump: "flagged" as EventOutcomeClass,
    duplicate_same_state_replay: "insufficient_evidence" as EventOutcomeClass,
    cross_system_inconsistent: "failed" as EventOutcomeClass,
  },
} as const;

export function assertBaselineContractCompleteness(
  entries: readonly BaselineContractEntry[],
  subjectType: SubjectType
): void {
  const filtered = entries.filter((e) => e.subject_type === subjectType);
  const byAngle = new Map(filtered.map((e) => [e.angle, e]));
  for (const angle of REAL_SUBJECT_ANGLE_ORDER) {
    const row = byAngle.get(angle);
    if (!row) throw new Error(`missing_baseline_contract_for_angle:${angle}`);
    if (!row.required_inputs.length) throw new Error(`baseline_contract_required_inputs_empty:${angle}`);
    if (!row.evaluation_rules.length) throw new Error(`baseline_contract_evaluation_rules_empty:${angle}`);
    if (!row.evidence_requirements.length) throw new Error(`baseline_contract_evidence_requirements_empty:${angle}`);
  }
}

export async function seedRealSubjectReadiness(db: Db): Promise<void> {
  assertBaselineContractCompleteness(REAL_SUBJECT_BASELINE_CONTRACT, REAL_SUBJECT.subject_type);
  await db
    .insert(subjects)
    .values({
      id: REAL_SUBJECT.subject_id,
      organizationId: REAL_SUBJECT.org_id,
      environmentId: REAL_SUBJECT.environment_id,
      railType: REAL_SUBJECT.subject_type,
      externalKey: REAL_SUBJECT.external_key,
    })
    .onConflictDoNothing({ target: subjects.id });

  const mappingRows = [
    {
      id: "66666666-6666-4666-8666-666666666610",
      sourceTypeKey: "demo.real.action_completed",
      canonicalEventType: "action_completed" as const,
    },
    {
      id: "66666666-6666-4666-8666-666666666611",
      sourceTypeKey: "demo.real.policy_checked",
      canonicalEventType: "policy_checked" as const,
    },
    {
      id: "66666666-6666-4666-8666-666666666612",
      sourceTypeKey: "demo.real.retrieval_completed",
      canonicalEventType: "retrieval_completed" as const,
    },
  ];
  for (const row of mappingRows) {
    await db
      .insert(mappingRules)
      .values({
        id: row.id,
        organizationId: REAL_SUBJECT.org_id,
        environmentId: REAL_SUBJECT.environment_id,
        sourceTypeKey: row.sourceTypeKey,
        canonicalEventType: row.canonicalEventType,
        isActive: true,
      })
      .onConflictDoNothing({
        target: [mappingRules.organizationId, mappingRules.environmentId, mappingRules.sourceTypeKey],
      });
  }

  for (const [idx, entry] of REAL_SUBJECT_BASELINE_CONTRACT.entries()) {
    await db
      .insert(baselines)
      .values({
        id: `66666666-6666-4666-8666-${(700 + idx).toString().padStart(12, "0")}`,
        organizationId: REAL_SUBJECT.org_id,
        environmentId: REAL_SUBJECT.environment_id,
        subjectId: REAL_SUBJECT.subject_id,
        angle: entry.angle,
        version: entry.version,
        definition: {
          ...entry.definition,
          angle: entry.angle,
          version: entry.version,
          subject_type: entry.subject_type,
          required_inputs: entry.required_inputs,
          expectations: entry.expectations,
          evaluation_rules: entry.evaluation_rules,
          evidence_requirements: entry.evidence_requirements,
        },
        effectiveFrom: new Date(entry.effective_from),
        effectiveTo: null,
      })
      .onConflictDoNothing({ target: [baselines.subjectId, baselines.angle, baselines.version] });
  }
}

export async function hasCompleteBaselinesForRealSubject(db: Db): Promise<boolean> {
  const rows = await db
    .select({ angle: baselines.angle })
    .from(baselines)
    .where(
      and(
        eq(baselines.organizationId, REAL_SUBJECT.org_id),
        eq(baselines.environmentId, REAL_SUBJECT.environment_id),
        eq(baselines.subjectId, REAL_SUBJECT.subject_id)
      )
    );
  const got = new Set(rows.map((r) => r.angle));
  return REAL_SUBJECT_ANGLE_ORDER.every((angle) => got.has(angle));
}

/**
 * Full evaluator-shaped baseline definitions for sandbox/demo subjects.
 * Merged into existing baseline rows after `createSubject` so `angle_control` from
 * rail defaults stays authoritative while policy/operational/etc. shapes match demo payloads.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { baselines } from "../db/schema/index.js";
import type { RailType } from "../protocol/angle-applicability.js";
import type { UniversalBaselineTemplate } from "../baselines/baseline-template-types.js";
import { UNIVERSAL_ANGLES } from "../product/product-proof.js";

export const SANDBOX_RAIL_BASELINE_SHAPES: Record<RailType, UniversalBaselineTemplate> = {
  model: {
    policy_integrity: {
      type: "policy_integrity_v1",
      required_tags: ["allow_read"],
    },
    identity_access_integrity: {
      type: "identity_access_integrity_v1",
      required_scopes: ["read:context"],
      expected_tenant_id: null,
      require_access_log: false,
    },
    operational_integrity: {
      type: "operational_integrity_v1",
      expected_status: "success",
      max_latency_ms: 800,
      require_no_runtime_error: true,
    },
    model_identity_integrity: {
      type: "model_identity_integrity_v1",
      expected_model: "reader-v2",
      require_exact_match: true,
    },
    retrieval_integrity: {
      type: "retrieval_integrity_v1",
      expected_sources: ["vector", "search"],
      min_sources: 1,
    },
    deterministic_integrity: {
      type: "deterministic_integrity_v1",
      expected_digest: "model-digest-v1",
      algorithm: "sha256",
      require_exact_match: true,
    },
    cross_system_integrity: {
      type: "cross_system_integrity_v1",
      expected_systems: ["gateway", "policy_engine"],
      require_all_systems: true,
    },
  },
  agent: {
    policy_integrity: {
      type: "policy_integrity_v1",
      required_tags: ["allow_read"],
    },
    identity_access_integrity: {
      type: "identity_access_integrity_v1",
      required_scopes: ["read:proofs"],
      expected_tenant_id: null,
      require_access_log: false,
    },
    operational_integrity: {
      type: "operational_integrity_v1",
      expected_status: "success",
      max_latency_ms: 2500,
      require_no_runtime_error: true,
    },
    model_identity_integrity: {
      type: "model_identity_integrity_v1",
      expected_model: "gpt-4.1-mini",
      require_exact_match: true,
    },
    retrieval_integrity: {
      type: "retrieval_integrity_v1",
      expected_sources: ["web", "kb-1"],
      min_sources: 1,
    },
    deterministic_integrity: {
      type: "deterministic_integrity_v1",
      expected_digest: "agent-digest-v1",
      algorithm: "sha256",
      require_exact_match: true,
    },
    cross_system_integrity: {
      type: "cross_system_integrity_v1",
      expected_systems: ["tool_runtime", "agent_core"],
      require_all_systems: true,
    },
  },
  service: {
    policy_integrity: {
      type: "policy_integrity_v1",
      required_tags: ["allow_read"],
    },
    identity_access_integrity: {
      type: "identity_access_integrity_v1",
      required_scopes: ["read:api"],
      expected_tenant_id: null,
      require_access_log: false,
    },
    operational_integrity: {
      type: "operational_integrity_v1",
      expected_status: "success",
      max_latency_ms: 2000,
      require_no_runtime_error: true,
    },
    model_identity_integrity: {
      type: "model_identity_integrity_v1",
      expected_model: "gpt-4.1-mini",
      require_exact_match: false,
    },
    retrieval_integrity: {
      type: "retrieval_integrity_v1",
      expected_sources: ["postgres", "redis", "vendor-api"],
      min_sources: 1,
    },
    deterministic_integrity: {
      type: "deterministic_integrity_v1",
      expected_digest: "svc-stable-digest-v1",
      algorithm: "sha256",
      require_exact_match: true,
    },
    cross_system_integrity: {
      type: "cross_system_integrity_v1",
      expected_systems: ["api_gateway", "service_core", "audit_log"],
      require_all_systems: true,
    },
  },
  endpoint: {
    policy_integrity: {
      type: "policy_integrity_v1",
      required_tags: ["allow_read"],
    },
    identity_access_integrity: {
      type: "identity_access_integrity_v1",
      required_scopes: [],
      expected_tenant_id: null,
      require_access_log: false,
    },
    operational_integrity: {
      type: "operational_integrity_v1",
      expected_status: "success",
      max_latency_ms: 2000,
      require_no_runtime_error: true,
    },
    model_identity_integrity: {
      type: "model_identity_integrity_v1",
      expected_model: "gpt-4.1-mini",
      require_exact_match: true,
    },
    retrieval_integrity: {
      type: "retrieval_integrity_v1",
      expected_sources: ["cache", "api"],
      min_sources: 1,
    },
    deterministic_integrity: {
      type: "deterministic_integrity_v1",
      expected_digest: "ep-digest-v1",
      algorithm: "sha256",
      require_exact_match: true,
    },
    cross_system_integrity: {
      type: "cross_system_integrity_v1",
      expected_systems: ["edge", "origin"],
      require_all_systems: true,
    },
  },
  system: {
    policy_integrity: {
      type: "policy_integrity_v1",
      required_tags: ["allow_read"],
    },
    identity_access_integrity: {
      type: "identity_access_integrity_v1",
      required_scopes: ["read:proofs"],
      expected_tenant_id: "tenant_demo",
      require_access_log: true,
    },
    operational_integrity: {
      type: "operational_integrity_v1",
      expected_status: "success",
      max_latency_ms: 1500,
      require_no_runtime_error: true,
    },
    model_identity_integrity: {
      type: "model_identity_integrity_v1",
      expected_model: "gpt-4.1-mini",
      require_exact_match: true,
    },
    retrieval_integrity: {
      type: "retrieval_integrity_v1",
      expected_sources: ["db", "cache"],
      min_sources: 2,
    },
    deterministic_integrity: {
      type: "deterministic_integrity_v1",
      expected_digest: "stable-demo-digest-v1",
      algorithm: "sha256",
      require_exact_match: true,
    },
    cross_system_integrity: {
      type: "cross_system_integrity_v1",
      expected_systems: ["ehr", "queue", "llm"],
      require_all_systems: true,
    },
  },
};

/** Sandbox/demo ingests use fixed historical `occurred_at` timestamps; baselines must be effective at those times. */
const SANDBOX_BASELINE_EFFECTIVE_FROM = new Date("1970-01-01T00:00:00.000Z");

/**
 * Create-or-upsert sandbox baselines: no angle can be missing after this runs.
 * If a baseline row already exists it is updated; if not, one is inserted with
 * `enabled: true` and the full evaluator-shaped definition from the rail template.
 */
export async function applySandboxRailBaselineShapes(
  db: Db,
  params: {
    organizationId: string;
    environmentId: string;
    subjectId: string;
    rail: RailType;
  },
): Promise<void> {
  const template = SANDBOX_RAIL_BASELINE_SHAPES[params.rail];
  for (const angle of UNIVERSAL_ANGLES) {
    const shape = template[angle as keyof UniversalBaselineTemplate] as Record<string, unknown>;
    const [row] = await db
      .select()
      .from(baselines)
      .where(
        and(
          eq(baselines.organizationId, params.organizationId),
          eq(baselines.environmentId, params.environmentId),
          eq(baselines.subjectId, params.subjectId),
          eq(baselines.angle, angle),
        ),
      )
      .limit(1);
    if (row) {
      const prev = row.definition as Record<string, unknown>;
      const angleControl = prev.angle_control !== undefined
        ? { angle_control: { ...(prev.angle_control as Record<string, unknown>), enabled: true } }
        : { angle_control: { enabled: true, required: false, default_origin: "auto", config: {} } };
      const merged: Record<string, unknown> = {
        ...shape,
        ...angleControl,
        rules: Array.isArray(prev.rules) ? prev.rules : [],
      };
      await db.update(baselines).set({
        definition: merged,
        effectiveFrom: SANDBOX_BASELINE_EFFECTIVE_FROM,
      }).where(eq(baselines.id, row.id));
    } else {
      await db.insert(baselines).values({
        organizationId: params.organizationId,
        environmentId: params.environmentId,
        subjectId: params.subjectId,
        angle,
        version: 1,
        definition: {
          ...shape,
          angle_control: { enabled: true, required: false, default_origin: "auto", config: {} },
          rules: [],
        },
        effectiveFrom: SANDBOX_BASELINE_EFFECTIVE_FROM,
      });
    }
  }
}

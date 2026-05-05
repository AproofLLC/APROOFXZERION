import type { AngleName, SubjectType } from "../product/product-proof.js";

export type BaselineSource = "declared" | "observed" | "policy" | "mixed" | "none";
export type BaselineStatus = "present" | "missing" | "insufficient" | "unsupported";

export interface AngleBaseline {
  angle: AngleName;
  subject_type: SubjectType;
  baseline_present: boolean;
  baseline_status: BaselineStatus;
  baseline_source: BaselineSource;
  baseline_version: string;
  baseline_rule_id: string;
  required_fields: string[];
  used_fields: string[];
  missing_fields: string[];
  expected_summary: string | null;
  actual_summary: string | null;
  baseline_summary: string | null;
  baseline_data: Record<string, unknown> | null;
  derivation_trace: string[];
}

export const BASELINE_ANGLES: readonly AngleName[] = [
  "policy_integrity",
  "identity_access_integrity",
  "operational_integrity",
  "model_identity_integrity",
  "retrieval_integrity",
  "deterministic_integrity",
  "cross_system_integrity",
] as const;

const RULES: Record<SubjectType, Record<AngleName, { required: string[]; expected: string }>> = {
  llm: {
    policy_integrity: { required: ["policy.tags", "policy.version"], expected: "Policy constraints satisfied for model output." },
    identity_access_integrity: { required: ["model_id", "provider", "org_id"], expected: "Model/provider/org identity is attributable." },
    operational_integrity: { required: ["operational.latency_ms", "operational.execution_status"], expected: "Model operation is within expected bounds." },
    model_identity_integrity: { required: ["model_identity.observed_model", "model_identity.version"], expected: "Claimed model identity is coherent." },
    retrieval_integrity: { required: ["retrieval.declared", "retrieval.tool_usage"], expected: "Retrieval usage is declared and traceable." },
    deterministic_integrity: { required: ["deterministic.observed_digest", "deterministic.temperature"], expected: "Determinism evaluated against inference config." },
    cross_system_integrity: { required: ["trace_id", "correlation_id"], expected: "Cross-system references are coherent." },
  },
  model: {
    policy_integrity: { required: ["policy.tags", "policy.version"], expected: "Policy constraints satisfied for model output." },
    identity_access_integrity: { required: ["model_id", "provider", "org_id"], expected: "Model/provider/org identity is attributable." },
    operational_integrity: { required: ["operational.latency_ms", "operational.execution_status"], expected: "Model operation is within expected bounds." },
    model_identity_integrity: { required: ["model_identity.observed_model", "model_identity.version"], expected: "Claimed model identity is coherent." },
    retrieval_integrity: { required: ["retrieval.declared", "retrieval.tool_usage"], expected: "Retrieval usage is declared and traceable." },
    deterministic_integrity: { required: ["deterministic.observed_digest", "deterministic.temperature"], expected: "Determinism evaluated against inference config." },
    cross_system_integrity: { required: ["trace_id", "correlation_id"], expected: "Cross-system references are coherent." },
  },
  agent: {
    policy_integrity: { required: ["policy.tags", "agent.allowed_actions"], expected: "Agent actions respect policy constraints." },
    identity_access_integrity: { required: ["agent_id", "identity_access.scopes"], expected: "Agent action is attributable and authorized." },
    operational_integrity: { required: ["agent.step_trace", "agent.execution_state"], expected: "Agent execution stages are complete." },
    model_identity_integrity: { required: ["model_identity.observed_model"], expected: "Agent parent model linkage is coherent." },
    retrieval_integrity: { required: ["retrieval.tool_usage", "retrieval.external_lookup"], expected: "External lookups are traceable." },
    deterministic_integrity: { required: ["agent.decision_trace", "deterministic.observed_digest"], expected: "Decision path is deterministic under given input." },
    cross_system_integrity: { required: ["tool_invocation_id", "external_response_id"], expected: "Agent output aligns with tool/system evidence." },
  },
  service: {
    policy_integrity: { required: ["policy.tags", "policy.rules"], expected: "Service response respects policy and data handling rules." },
    identity_access_integrity: { required: ["service_id", "identity_access.api_key"], expected: "Service invocation is attributable and authenticated." },
    operational_integrity: { required: ["operational.execution_status", "operational.latency_ms"], expected: "Service operated within expected bounds." },
    model_identity_integrity: { required: ["model_identity.observed_model"], expected: "AI-backed service model linkage is coherent." },
    retrieval_integrity: { required: ["retrieval.declared_dependencies", "retrieval.external_lookup"], expected: "Service dependencies are declared and coherent." },
    deterministic_integrity: { required: ["deterministic.observed_digest", "operation_type"], expected: "Comparable request class produces expected deterministic behavior." },
    cross_system_integrity: { required: ["trace_id", "request_id", "dependency_id"], expected: "Request aligns across connected systems." },
  },
  system: {
    policy_integrity: { required: ["policy.tags", "system.rails"], expected: "System behavior complies with declared rails and constraints." },
    identity_access_integrity: { required: ["identity_access.actor_id", "identity_access.role"], expected: "Action is attributable and authorized." },
    operational_integrity: { required: ["operational.execution_status", "operational.latency_ms"], expected: "Operational execution is traceable and within bounds." },
    model_identity_integrity: { required: ["model_identity.observed_model"], expected: "Embedded model linkage is coherent." },
    retrieval_integrity: { required: ["retrieval.retrieved_sources"], expected: "Accessed data sources are coherent and allowed." },
    deterministic_integrity: { required: ["deterministic.observed_digest", "workflow.stage"], expected: "Workflow progression matches expected deterministic path." },
    cross_system_integrity: { required: ["cross_system.observed_systems", "sync_id"], expected: "Integrated system state aligns across boundaries." },
  },
  endpoint: {
    policy_integrity: { required: ["policy.tags", "endpoint.restrictions"], expected: "Endpoint respects allowed action boundaries." },
    identity_access_integrity: { required: ["endpoint_id", "identity_access.actor_id"], expected: "Endpoint action is attributable and trusted." },
    operational_integrity: { required: ["operational.execution_status", "endpoint.connectivity_state"], expected: "Endpoint follows expected operational path." },
    model_identity_integrity: { required: ["model_identity.observed_model", "model_identity.version"], expected: "Endpoint local model identity is coherent." },
    retrieval_integrity: { required: ["retrieval.local_source", "retrieval.remote_source"], expected: "Endpoint source usage is traceable." },
    deterministic_integrity: { required: ["deterministic.observed_digest", "request_type"], expected: "Comparable endpoint inputs yield stable expected behavior." },
    cross_system_integrity: { required: ["sync_id", "upload_id", "callback_id"], expected: "Endpoint state aligns with server/system state." },
  },
};

function readPath(payload: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = payload;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function presentValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function normalizeSubjectType(input: string): SubjectType {
  const v = input.trim().toLowerCase();
  if (v === "llm") return "llm";
  if (v === "bot") return "agent";
  if (v === "saas") return "service";
  if (v === "model" || v === "llm" || v === "agent" || v === "service" || v === "system" || v === "endpoint") return v;
  return "system";
}

export function deriveAllAngleBaselines(input: {
  subjectType: string;
  canonicalEvent: { payload: Record<string, unknown>; trace_id?: string };
}): Record<AngleName, AngleBaseline> {
  const subjectType = normalizeSubjectType(input.subjectType);
  const payload = input.canonicalEvent.payload ?? {};
  const byAngle = {} as Record<AngleName, AngleBaseline>;
  for (const angle of BASELINE_ANGLES) {
    const rule = RULES[subjectType][angle];
    const used_fields: string[] = [];
    const missing_fields: string[] = [];
    const baseline_data: Record<string, unknown> = {};
    const derivation_trace: string[] = [];
    for (const field of rule.required) {
      const v = field === "trace_id" ? input.canonicalEvent.trace_id : readPath(payload, field);
      used_fields.push(field);
      if (!presentValue(v)) {
        missing_fields.push(field);
        derivation_trace.push(`missing:${field}`);
      } else {
        derivation_trace.push(`present:${field}`);
        baseline_data[field] = v as unknown;
      }
    }
    const baseline_present = missing_fields.length === 0;
    const baseline_status: BaselineStatus = baseline_present ? "present" : "missing";
    const baseline_source: BaselineSource = baseline_present ? "observed" : "none";
    byAngle[angle] = {
      angle,
      subject_type: subjectType,
      baseline_present,
      baseline_status,
      baseline_source,
      baseline_version: "v1",
      baseline_rule_id: `${subjectType}.${angle}.v1`,
      required_fields: [...rule.required],
      used_fields,
      missing_fields,
      expected_summary: rule.expected,
      actual_summary: baseline_present
        ? `Observed required baseline inputs for ${angle}.`
        : `Missing required baseline inputs for ${angle}.`,
      baseline_summary: baseline_present
        ? `${subjectType}/${angle} baseline derived from observed event fields.`
        : `${subjectType}/${angle} baseline source missing or insufficient.`,
      baseline_data: baseline_present ? baseline_data : null,
      derivation_trace,
    };
  }
  return byAngle;
}

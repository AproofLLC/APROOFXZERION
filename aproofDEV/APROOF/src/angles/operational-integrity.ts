export type OperationalIntegrityBaseline = {
  type: "operational_integrity_v1";
  version?: number;
  effective_from?: string;
  expected_status: "success";
  max_latency_ms: number;
  require_no_runtime_error: boolean;
};

export type OperationalIntegrityEvent = {
  execution_status: "success" | "failure";
  latency_ms: number;
  runtime_error: string | null;
};

export type OperationalIntegrityEvaluation = {
  angle: "operational_integrity";
  applicable: true;
  status: "conformant" | "violated";
  reason_code:
    | null
    | "OPERATIONAL_STATUS_MISMATCH"
    | "OPERATIONAL_LATENCY_EXCEEDED"
    | "OPERATIONAL_RUNTIME_ERROR_PRESENT";
  summary: string;
  evidence_refs: string[];
};

export function evaluateOperationalIntegrity(input: {
  canonicalEvent: OperationalIntegrityEvent;
  baseline: OperationalIntegrityBaseline;
}): OperationalIntegrityEvaluation {
  const { canonicalEvent, baseline } = input;

  if (canonicalEvent.execution_status !== baseline.expected_status) {
    return {
      angle: "operational_integrity",
      applicable: true,
      status: "violated",
      reason_code: "OPERATIONAL_STATUS_MISMATCH",
      summary: "Execution status did not match expected operational status.",
      evidence_refs: [],
    };
  }

  if (canonicalEvent.latency_ms > baseline.max_latency_ms) {
    return {
      angle: "operational_integrity",
      applicable: true,
      status: "violated",
      reason_code: "OPERATIONAL_LATENCY_EXCEEDED",
      summary: "Observed latency exceeded the operational baseline threshold.",
      evidence_refs: [],
    };
  }

  if (baseline.require_no_runtime_error && canonicalEvent.runtime_error !== null) {
    return {
      angle: "operational_integrity",
      applicable: true,
      status: "violated",
      reason_code: "OPERATIONAL_RUNTIME_ERROR_PRESENT",
      summary: "Runtime error was present while baseline requires none.",
      evidence_refs: [],
    };
  }

  return {
    angle: "operational_integrity",
    applicable: true,
    status: "conformant",
    reason_code: null,
    summary: "Operational integrity satisfied the active baseline.",
    evidence_refs: [],
  };
}

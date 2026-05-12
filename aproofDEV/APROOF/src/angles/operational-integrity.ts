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

/** Deterministic Zerion / scoped-policy codes surfaced on operational_integrity when execution_status fails or runtime_error is set. */
export const OPERATIONAL_ZERION_DETAIL_REASON_CODES = new Set([
  "ZERION_INTEGRATION_NOT_READY",
  "POLICY_CHAIN_NOT_ALLOWED",
  "POLICY_SPEND_LIMIT_EXCEEDED",
  "POLICY_ASSET_NOT_APPROVED",
  "POLICY_EXPIRED",
  "ZERION_GOD_MODE_FORBIDDEN",
  "ZERION_POLICY_BLOCKED",
  "ZERION_CLI_PATH_INVALID",
  "ZERION_CLI_EXECUTION_FAILED",
  "ZERION_TX_HASH_MISSING",
  "ZERION_CLI_TIMEOUT",
  "ZERION_CLI_INVALID_OUTPUT",
  "ZERION_CLI_TX_HASH_MISSING",
  "ZERION_CLI_SPAWN_FAILED",
  "SOLANA_DEVNET_ANCHOR_FAILED",
  "SOLANA_DEVNET_WALLET_UNFUNDED",
  "SOLANA_DEVNET_RPC_UNAVAILABLE",
  "SOLANA_DEVNET_KEYPAIR_INVALID",
  "SOLANA_DEVNET_SIGNATURE_MISSING",
]);

export type OperationalIntegrityEvaluation = {
  angle: "operational_integrity";
  applicable: true;
  status: "conformant" | "violated";
  reason_code:
    | null
    | "OPERATIONAL_STATUS_MISMATCH"
    | "OPERATIONAL_LATENCY_EXCEEDED"
    | "OPERATIONAL_RUNTIME_ERROR_PRESENT"
    | string;
  summary: string;
  evidence_refs: string[];
};

export function evaluateOperationalIntegrity(input: {
  canonicalEvent: OperationalIntegrityEvent;
  baseline: OperationalIntegrityBaseline;
}): OperationalIntegrityEvaluation {
  const { canonicalEvent, baseline } = input;

  if (canonicalEvent.execution_status !== baseline.expected_status) {
    const re = canonicalEvent.runtime_error?.trim() ?? "";
    if (re && OPERATIONAL_ZERION_DETAIL_REASON_CODES.has(re)) {
      return {
        angle: "operational_integrity",
        applicable: true,
        status: "violated",
        reason_code: re,
        summary: "Operational execution blocked or failed per scoped Zerion policy gate or CLI result.",
        evidence_refs: [],
      };
    }
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
    const re = canonicalEvent.runtime_error.trim();
    if (re && OPERATIONAL_ZERION_DETAIL_REASON_CODES.has(re)) {
      return {
        angle: "operational_integrity",
        applicable: true,
        status: "violated",
        reason_code: re,
        summary: "Runtime error carried a deterministic Zerion or policy gate code.",
        evidence_refs: [],
      };
    }
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

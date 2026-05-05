import {
  UniversalAngleResult,
  UniversalAngle,
  ANGLE_STATUSES,
  UNIVERSAL_ANGLES,
  PRODUCT_ANGLE_NAMES,
} from "./product-proof.js";

export interface ContractValidationResult {
  ok: boolean;
  normalized: UniversalAngleResult[];
  failureReason: string | null;
}

export class UniversalAngleContractError extends Error {
  public readonly code: "ANGLE_CONTRACT_VIOLATION" | "INCOMPLETE_ANGLE_SET";
  public readonly failure_locator: {
    angle: string | null;
    step: string;
    reason_code: string;
    detail: string;
  };

  constructor(message: string) {
    const code = message.split(":")[0] as "ANGLE_CONTRACT_VIOLATION" | "INCOMPLETE_ANGLE_SET";
    super(message);
    this.name = "UniversalAngleContractError";
    this.code = code;
    this.failure_locator = {
      angle: null,
      step: "angle_contract_validation",
      reason_code: code,
      detail: message,
    };
  }
}

export function sortAnglesCanonical(results: UniversalAngleResult[]): UniversalAngleResult[] {
  const resultByAngle = new Map(results.map((r) => [r.angle, r]));
  return PRODUCT_ANGLE_NAMES.map((angleName) => {
    const result = resultByAngle.get(angleName);
    if (!result) {
      throw new Error(`Missing angle ${angleName} during normalization`);
    }
    return result;
  });
}

export function finalizeProofAnglesOrThrow(results: UniversalAngleResult[]): UniversalAngleResult[] {
  const contractResult = assertUniversalAngleContract(results);
  if (!contractResult.ok) {
    throw new UniversalAngleContractError(contractResult.failureReason ?? "ANGLE_CONTRACT_VIOLATION: Unknown contract failure");
  }
  return contractResult.normalized;
}

/**
 * Central validator for the universal 7-angle contract.
 * Enforces all structural rules and normalizes output.
 */
export function assertUniversalAngleContract(
  results: UniversalAngleResult[]
): ContractValidationResult {
  // Check total count
  if (results.length !== 7) {
    return {
      ok: false,
      normalized: [],
      failureReason: `INCOMPLETE_ANGLE_SET: Expected exactly 7 angles, got ${results.length}`,
    };
  }

  // Check for duplicates and collect angle info
  const seen = new Set<UniversalAngle>();
  const angleMap = new Map<UniversalAngle, UniversalAngleResult>();
  const unknowns: string[] = [];

  for (const result of results) {
    if (seen.has(result.angle)) {
      return {
        ok: false,
        normalized: [],
        failureReason: `ANGLE_CONTRACT_VIOLATION: Duplicate angle "${result.angle}"`,
      };
    }
    seen.add(result.angle);
    angleMap.set(result.angle, result);
    
    if (!UNIVERSAL_ANGLES.includes(result.angle)) {
      unknowns.push(result.angle);
    }
  }

  // Check for unknown angles
  if (unknowns.length > 0) {
    return {
      ok: false,
      normalized: [],
      failureReason: `ANGLE_CONTRACT_VIOLATION: Unknown angle "${unknowns[0]}"`,
    };
  }

  // Check all required angles are present
  for (const requiredAngle of UNIVERSAL_ANGLES) {
    if (!seen.has(requiredAngle)) {
      return {
        ok: false,
        normalized: [],
        failureReason: `INCOMPLETE_ANGLE_SET: Missing required angle "${requiredAngle}"`,
      };
    }
  }

  // Validate each result structure
  for (const result of results) {
    if (!result.angle || typeof result.angle !== "string") {
      return {
        ok: false,
        normalized: [],
        failureReason: `ANGLE_CONTRACT_VIOLATION: Invalid angle field`,
      };
    }
    if (!result.status || typeof result.status !== "string") {
      return {
        ok: false,
        normalized: [],
        failureReason: `ANGLE_CONTRACT_VIOLATION: Invalid status field for angle "${result.angle}"`,
      };
    }
    if (!ANGLE_STATUSES.includes(result.status)) {
      return {
        ok: false,
        normalized: [],
        failureReason: `ANGLE_CONTRACT_VIOLATION: Unsupported status "${result.status}" for angle "${result.angle}"`,
      };
    }
    if (!result.reason_code || typeof result.reason_code !== "string") {
      return {
        ok: false,
        normalized: [],
        failureReason: `ANGLE_CONTRACT_VIOLATION: Missing or invalid reason_code for angle "${result.angle}"`,
      };
    }
    if (!result.summary || typeof result.summary !== "string" || result.summary.trim() === "") {
      return {
        ok: false,
        normalized: [],
        failureReason: `ANGLE_CONTRACT_VIOLATION: Missing or empty summary for angle "${result.angle}"`,
      };
    }
    if (!Array.isArray(result.evidence_refs)) {
      return {
        ok: false,
        normalized: [],
        failureReason: `ANGLE_CONTRACT_VIOLATION: evidence_refs must be an array for angle "${result.angle}"`,
      };
    }
    if (
      (result.status === "pass" || result.status === "fail" || result.status === "warn") &&
      result.evidence_refs.length === 0 &&
      result.reason_code !== "NO_SOURCES" &&
      result.reason_code !== "NOT_APPLICABLE" &&
      result.reason_code !== "BASELINE_MISSING" &&
      result.reason_code !== "NO_BASELINE_SOURCE" &&
      result.reason_code !== "ANGLE_DISABLED" &&
      result.reason_code !== "OPTIONAL_NO_SOURCE" &&
      result.reason_code !== "REQUIRED_SOURCE_MISSING"
    ) {
      return {
        ok: false,
        normalized: [],
        failureReason: `ANGLE_CONTRACT_VIOLATION: evidence_refs cannot be empty for evaluated angle "${result.angle}"`,
      };
    }
  }

  // Normalize sources_state
  const normalizedResults = results.map((result) => {
    const normalized: UniversalAngleResult = { ...result };

    normalized.evidence_refs = Array.isArray(normalized.evidence_refs)
      ? [...normalized.evidence_refs].sort()
      : [];
    normalized.compared_fields = Array.isArray(normalized.compared_fields)
      ? [...normalized.compared_fields].sort()
      : [];
    normalized.changed_fields = Array.isArray(normalized.changed_fields)
      ? [...normalized.changed_fields].sort()
      : [];
    if (typeof normalized.applicable !== "boolean") {
      normalized.applicable = normalized.status === "not_applicable" ? false : normalized.evidence_refs.length > 0;
    }

    // Set sources_state based on evidence_refs
    if (normalized.evidence_refs.length === 0) {
      if (!normalized.sources_state) {
        normalized.sources_state = "no sources";
      }
    } else {
      if (!normalized.sources_state) {
        normalized.sources_state = "present";
      }
    }
    normalized.baseline_present = normalized.baseline_present ?? false;
    normalized.baseline_status = normalized.baseline_status ?? "insufficient";
    normalized.baseline_source = normalized.baseline_source ?? "none";
    normalized.baseline_version = normalized.baseline_version ?? "v1";
    normalized.baseline_rule_id = normalized.baseline_rule_id ?? "unknown.pending.v1";
    normalized.baseline_summary = normalized.baseline_summary ?? "No baseline summary available.";
    normalized.expected_summary = normalized.expected_summary ?? null;
    normalized.actual_summary = normalized.actual_summary ?? null;

    return normalized;
  });

  // Sort into canonical order
  const sortedResults = sortAnglesCanonical(normalizedResults);

  return {
    ok: true,
    normalized: sortedResults,
    failureReason: null,
  };
}

/**
 * Helper to build a no-sources angle result.
 */
export function buildNoSourcesAngleResult(
  angle: UniversalAngle,
  reasonCode: string,
  summary: string
): UniversalAngleResult {
  return {
    angle,
    applicable: false,
    status: "insufficient_evidence",
    reason_code: reasonCode,
    summary,
    evidence_refs: [],
    sources_state: "no sources",
  };
}

/**
 * Helper to build a not-applicable angle result.
 */
export function buildNotApplicableAngleResult(
  angle: UniversalAngle,
  reasonCode: string,
  summary: string
): UniversalAngleResult {
  return {
    angle,
    status: "not_applicable",
    reason_code: reasonCode,
    summary,
    evidence_refs: [],
    sources_state: "no sources",
    applicable: false,
  };
}

/**
 * Helper to build a missing-baseline angle result.
 */
export function buildMissingBaselineAngleResult(
  angle: UniversalAngle,
  summary: string
): UniversalAngleResult {
  return {
    angle,
    applicable: false,
    status: "insufficient_evidence",
    reason_code: "BASELINE_MISSING",
    summary,
    evidence_refs: [],
    sources_state: "no sources",
  };
}

/**
 * Helper to build an insufficient-evidence angle result.
 */
export function buildInsufficientEvidenceAngleResult(
  angle: UniversalAngle,
  reasonCode: string,
  summary: string
): UniversalAngleResult {
  return {
    angle,
    applicable: false,
    status: "insufficient_evidence",
    reason_code: reasonCode,
    summary,
    evidence_refs: [],
    sources_state: "no sources",
  };
}
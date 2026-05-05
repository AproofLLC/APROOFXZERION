import type { PipelineProofUnit, ProcessEventSuccess } from "../pipeline/process-event.js";
import { REASON_CODE } from "../protocol/proof-vocabulary.js";
import { PRODUCT_ANGLE_NAMES, type ProductProof } from "./product-proof.js";

export type FailureCategory =
  | "CONFIG_MISSING"
  | "PAYLOAD_MISSING"
  | "MISMATCH"
  | "THRESHOLD_EXCEEDED"
  | "EXPECTED_SOURCE_MISSING"
  | "UNKNOWN";

export type FailureInsight = {
  angle: string;
  delta_code: string | null;
  category: FailureCategory;
  cluster_key: string;
  summary: string;
};

export type FailureRollup = {
  failed_angles: string[];
  primary_failure_category: FailureCategory | null;
  primary_failure_summary: string | null;
  insights: FailureInsight[];
};

/** Match `product_proof.angles` canonical order for deterministic UI rollup. */
function angleOrderIndex(angle: string): number {
  const idx = (PRODUCT_ANGLE_NAMES as readonly string[]).indexOf(angle);
  return idx === -1 ? 999 : idx;
}

export function buildFailureClusterKey(
  angle: string,
  category: FailureCategory,
  delta_code: string | null
): string {
  return `${angle}:${category}:${delta_code ?? "none"}`;
}

/**
 * Maps pipeline `delta_code` values to a coarse failure category for dashboards and ops.
 */
export function mapDeltaCodeToFailureCategory(delta_code: string | null): FailureCategory {
  if (delta_code == null || delta_code === "") return "UNKNOWN";
  const c = delta_code;

  if (c === "NO_SOURCES") return "PAYLOAD_MISSING";

  if (c === "BASELINE_MISSING") return "CONFIG_MISSING";

  if (c === "REQUIRED_SOURCE_MISSING") return "CONFIG_MISSING";

  if (c === "OPTIONAL_NO_SOURCE" || c.startsWith("OPTIONAL_")) return "PAYLOAD_MISSING";

  if (c === "RETRIEVAL_EXPECTED_SOURCE_MISSING" || c === "CROSS_SYSTEM_EXPECTED_SYSTEM_MISSING") {
    return "EXPECTED_SOURCE_MISSING";
  }

  if (c.endsWith("_LATENCY_EXCEEDED")) return "THRESHOLD_EXCEEDED";

  if (c.includes("_MISMATCH")) return "MISMATCH";

  if (
    c === "POLICY_BASELINE_SHAPE" ||
    c === "POLICY_BASELINE_TYPE" ||
    c === "IDENTITY_ACCESS_BASELINE_SHAPE" ||
    c === "IDENTITY_ACCESS_BASELINE_TYPE" ||
    c === "RETRIEVAL_BASELINE_INVALID" ||
    c === "OPERATIONAL_BASELINE_OR_PAYLOAD_SHAPE"
  ) {
    return "CONFIG_MISSING";
  }

  if (c.endsWith("_MISSING")) return "PAYLOAD_MISSING";

  if (
    c === "RETRIEVAL_NO_SOURCES" ||
    c === "RETRIEVAL_TOO_FEW_SOURCES" ||
    c === "CROSS_SYSTEM_SYSTEMS_MISSING"
  ) {
    return "PAYLOAD_MISSING";
  }

  if (c === "POLICY_OBSERVED_SHAPE" || c === "IDENTITY_ACCESS_OBSERVED_SHAPE") {
    return "PAYLOAD_MISSING";
  }

  return "UNKNOWN";
}

function isFailingProofUnit(unit: PipelineProofUnit): boolean {
  if (unit.delta_code === REASON_CODE.ANGLE_DISABLED || unit.delta_code === REASON_CODE.NOT_APPLICABLE) {
    return false;
  }
  return unit.status === "violated" || unit.status === "flagged" || unit.status === "unverifiable";
}

function resolveSummary(
  productSummary: string | null | undefined,
  delta_code: string | null,
  category: FailureCategory
): string {
  const trimmed = typeof productSummary === "string" ? productSummary.trim() : "";
  if (trimmed) return trimmed;
  if (delta_code) return delta_code;
  switch (category) {
    case "CONFIG_MISSING":
      return "Required baseline or configuration was missing or invalid for this angle.";
    case "PAYLOAD_MISSING":
      return "Required payload fields for this angle were missing or incomplete.";
    case "MISMATCH":
      return "Observed values did not match baseline expectations.";
    case "THRESHOLD_EXCEEDED":
      return "A latency or numeric threshold defined by the baseline was exceeded.";
    case "EXPECTED_SOURCE_MISSING":
      return "An expected source or system required by the baseline was not present.";
    default:
      return "Failure category could not be determined from the available signals.";
  }
}

function failedAnglesInProductOrder(insights: FailureInsight[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of PRODUCT_ANGLE_NAMES) {
    if (insights.some((i) => i.angle === name) && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  for (const i of insights) {
    if (!seen.has(i.angle)) {
      seen.add(i.angle);
      out.push(i.angle);
    }
  }
  return out;
}

/** Lower = more severe / primary for ops dashboards. */
function categoryPriority(cat: FailureCategory): number {
  switch (cat) {
    case "MISMATCH":
      return 0;
    case "CONFIG_MISSING":
      return 1;
    case "EXPECTED_SOURCE_MISSING":
      return 2;
    case "THRESHOLD_EXCEEDED":
      return 3;
    case "PAYLOAD_MISSING":
      return 4;
    default:
      return 5;
  }
}

function sortInsightsForOps(insights: FailureInsight[]): void {
  insights.sort((a, b) => {
    const p = categoryPriority(a.category) - categoryPriority(b.category);
    if (p !== 0) return p;
    const d = angleOrderIndex(a.angle) - angleOrderIndex(b.angle);
    if (d !== 0) return d;
    const cd = (a.delta_code ?? "").localeCompare(b.delta_code ?? "");
    if (cd !== 0) return cd;
    return a.cluster_key.localeCompare(b.cluster_key);
  });
}

export function buildFailureRollup(productProof: ProductProof, pipeline: ProcessEventSuccess): FailureRollup {
  const summaryByAngle = new Map<string, string | null | undefined>();
  for (const a of productProof.angles) {
    summaryByAngle.set(a.angle, a.summary);
  }

  const insights: FailureInsight[] = [];
  const seenAngleFromUnit = new Set<string>();

  for (const unit of pipeline.proof_units) {
    if (!isFailingProofUnit(unit)) continue;
    seenAngleFromUnit.add(unit.angle);
    const category = mapDeltaCodeToFailureCategory(unit.delta_code);
    const summary = resolveSummary(summaryByAngle.get(unit.angle), unit.delta_code, category);
    insights.push({
      angle: unit.angle,
      delta_code: unit.delta_code,
      category,
      cluster_key: buildFailureClusterKey(unit.angle, category, unit.delta_code),
      summary,
    });
  }

  for (const a of productProof.angles) {
    if (a.status !== "fail" && a.status !== "warn") continue;
    if (seenAngleFromUnit.has(a.angle)) continue;
    const delta = a.reason_code ?? null;
    const category = mapDeltaCodeToFailureCategory(delta);
    insights.push({
      angle: a.angle,
      delta_code: delta,
      category,
      cluster_key: buildFailureClusterKey(a.angle, category, delta),
      summary: resolveSummary(a.summary, delta, category),
    });
  }

  sortInsightsForOps(insights);

  const failed_angles = failedAnglesInProductOrder(insights);
  const first = insights[0];

  return {
    failed_angles,
    primary_failure_category: first?.category ?? null,
    primary_failure_summary: first?.summary ?? null,
    insights,
  };
}

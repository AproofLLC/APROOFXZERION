import { ANGLE_LABELS } from "../constants/angle-display";
import { AUTO_ENABLED_ANGLES_BY_RAIL } from "../constants/rail-auto-enabled";
import type { ProofListSummary } from "../api/types";

function angleTitle(angle: string): string {
  return ANGLE_LABELS[angle]?.title ?? angle;
}

function activeBaselineTitlesForRail(rail: string): string {
  const r = rail?.trim() || "system";
  const by = AUTO_ENABLED_ANGLES_BY_RAIL as Readonly<Record<string, readonly string[]>>;
  const ids = by[r] ?? by.system!;
  return ids.map((a: string) => angleTitle(a)).join(" · ");
}

/**
 * Normalize proof statuses from the product proof API (`verified` / `failed` / …)
 * and overview snapshots (`conformant` / `violated` / …).
 */
export type DemoOutcomeClass = "conformant" | "non_conformant" | "partial" | "unverifiable" | "unknown";

export function classifyEngineProofOutcome(proofStatus: string | null | undefined): DemoOutcomeClass {
  const s = (proofStatus ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s === "verified" || s === "conformant") return "conformant";
  if (s === "failed" || s === "violated" || s === "unproofable") return "non_conformant";
  if (s === "flagged") return "partial";
  if (s === "unverifiable") return "unverifiable";
  return "unknown";
}

/** Short label for banners and last-action lines (matches product vocabulary). */
export function outcomeShortLabel(proofStatus: string | null | undefined): string {
  const cls = classifyEngineProofOutcome(proofStatus);
  if (cls === "conformant") return "conformant";
  if (cls === "non_conformant") return "violated";
  if (cls === "partial") return "flagged";
  if (cls === "unverifiable") return "unverifiable";
  return "pending";
}

export type DemoProofOutcomePresentation = {
  headline: string;
  subheadline: string;
  baselineDetail: string | null;
};

function railConformantSubline(rail: string): string {
  const r = rail?.trim() || "system";
  if (r === "model")
    return "Model outputs satisfied active identity, policy, and operational baselines.";
  if (r === "agent")
    return "Zerion Agent execution path satisfied scoped policy, operational, and cross-system baselines on Solana devnet.";
  if (r === "service") return "Service action satisfied active policy and operational baselines.";
  if (r === "endpoint") return "Endpoint request satisfied active access and operational baselines.";
  return "System event remained aligned across active policy, operational, and cross-system baselines.";
}

function railNonConformantSubline(rail: string): string {
  const r = rail?.trim() || "system";
  if (r === "model") return "Model outputs violated an active baseline (identity, policy, or operations).";
  if (r === "agent")
    return "Zerion Agent action violated scoped policy or operational baseline (see Failure Locator for the angle and reason code).";
  if (r === "service") return "Service action violated an active policy or operational baseline.";
  if (r === "endpoint") return "Endpoint request violated the active access or operational baseline.";
  return "System event violated active policy or cross-system baseline expectations.";
}

/**
 * Proof list / detail: driven only by `ProofListSummary` + rail (no scenario button intent).
 */
export function getDemoProofOutcomePresentation(
  rail: string,
  sum: Pick<
    ProofListSummary,
    | "proof_status"
    | "failure_locator_summary"
    | "failed_angles"
    | "primary_failure_category"
    | "proof_sufficiency"
  >,
): DemoProofOutcomePresentation {
  const cls = classifyEngineProofOutcome(sum.proof_status);
  const fl = sum.failure_locator_summary;
  const angleLabel = fl?.angle ? angleTitle(fl.angle) : null;

  if (cls === "conformant") {
    return {
      headline: "Conformant",
      subheadline: railConformantSubline(rail),
      baselineDetail: `Default active angles: ${activeBaselineTitlesForRail(rail)}`,
    };
  }

  if (cls === "partial") {
    return {
      headline: "Flagged",
      subheadline:
        sum.primary_failure_category != null && String(sum.primary_failure_category).trim() !== ""
          ? `Open proof detail — review ${String(sum.primary_failure_category)} before relying on this result.`
          : "Proof has open flags; confirm angles and evidence before you treat it as decisive.",
      baselineDetail:
        angleLabel && fl?.reason_code
          ? `${angleLabel}: ${humanizeReasonSnippet(String(fl.reason_code))}.`
          : fl?.reason_code
            ? humanizeReasonSnippet(String(fl.reason_code))
            : null,
    };
  }

  if (cls === "non_conformant") {
    const failedList =
      Array.isArray(sum.failed_angles) && sum.failed_angles.length > 0
        ? sum.failed_angles.slice(0, 3).map(angleTitle).join(", ")
        : null;
    return {
      headline: "Violated",
      subheadline: railNonConformantSubline(rail),
      baselineDetail:
        angleLabel && fl?.reason_code
          ? `First failure: ${angleLabel} — ${humanizeReasonSnippet(String(fl.reason_code))}.`
          : failedList
            ? `Failing evaluations: ${failedList}.`
            : fl?.reason_code
              ? humanizeReasonSnippet(String(fl.reason_code))
              : null,
    };
  }

  if (cls === "unverifiable") {
    return {
      headline: "Unverifiable",
      subheadline:
        sum.proof_sufficiency != null && String(sum.proof_sufficiency).trim() !== ""
          ? `Sufficiency ${String(sum.proof_sufficiency)} — no decisive pass/fail from the engine.`
          : "Evidence or preconditions did not support a decisive result; see angle rows.",
      baselineDetail: null,
    };
  }

  return {
    headline: "Pending",
    subheadline:
      sum.proof_sufficiency != null && String(sum.proof_sufficiency).trim() !== ""
        ? `Sufficiency field: ${sum.proof_sufficiency}.`
        : "Open proof detail for the engine read when processing finishes.",
    baselineDetail: null,
  };
}

function humanizeReasonSnippet(code: string): string {
  const c = code.trim();
  if (!c) return "unspecified";
  const table: Record<string, string> = {
    OK: "no issue recorded",
    NOT_APPLICABLE: "not applicable for this event",
    VIOLATION: "deviation from baseline",
    NO_SOURCES: "no evidence fields for this angle",
    BASELINE_MISSING: "baseline not present for evaluation",
    INSUFFICIENT_EVIDENCE: "insufficient evidence for a definitive result",
    REQUIRED_SOURCE_MISSING: "required evidence missing",
  };
  const hit = table[c] ?? table[c.toUpperCase()];
  if (hit) return hit;
  const u = c.toUpperCase();
  if (u.includes("MISMATCH")) return "observation did not match baseline";
  if (u.includes("POLICY")) return "policy expectation not met";
  if (u.includes("IDENTITY") || u.includes("MODEL")) return "identity expectation not met";
  if (u.includes("LATENCY")) return "latency outside allowed bounds";
  if (u.includes("DIGEST") || u.includes("DETERMINISTIC")) return "repeatability signal off contract";
  if (u.includes("ACCESS") || u.includes("AUTH")) return "access or auth expectation not met";
  if (u.includes("CROSS")) return "cross-system reference expectation not met";
  if (u.includes("RETRIEVAL")) return "retrieval or grounding expectation not met";
  const words = c.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** When exactly one angle fails and it is operational, all other angles are pass/warn (demo strip). */
export function getOperationalOnlySixOfSevenCopy(
  anglesSummary: Array<{ angle: string; status: string }> | undefined | null,
): string | null {
  if (!Array.isArray(anglesSummary) || anglesSummary.length === 0) return null;
  const op = anglesSummary.find((a) => a.angle === "operational_integrity");
  if (op?.status !== "fail") return null;
  const others = anglesSummary.filter((a) => a.angle !== "operational_integrity");
  if (others.length === 0) return null;
  const othersOk = others.every((a) => a.status === "pass" || a.status === "warn");
  return othersOk ? "6/7 integrity checks passed — blocked at operational_integrity." : null;
}

/** Overview `latest_proof_snapshot.status` uses DB unit aggregate (`conformant` / `violated`). */
export function getDemoOverviewOutcomeCopy(
  rail: string,
  snapshotStatus: string | null | undefined,
  operationalReasonCode?: string | null,
  zerionTxHash?: string | null,
  anchorSignature?: string | null,
): string {
  const cls = classifyEngineProofOutcome(snapshotStatus);
  const r = rail?.trim() || "system";
  const rc = (operationalReasonCode ?? "").trim();
  const ztx = typeof zerionTxHash === "string" && zerionTxHash.trim().length >= 32 ? zerionTxHash.trim() : "";
  const anchor =
    typeof anchorSignature === "string" && anchorSignature.trim().length >= 32 ? anchorSignature.trim() : "";

  if (r === "agent" && rc === "ZERION_INTEGRATION_NOT_READY") {
    return "Execution layer incomplete — AProof policy/proof/anchor path is working, but live Zerion CLI execution is not configured.";
  }
  if (cls === "non_conformant" && r === "agent" && rc === "POLICY_SPEND_LIMIT_EXCEEDED") {
    return "Execution blocked before Zerion CLI invocation due to scoped policy violation.";
  }
  if (r === "agent" && anchor && !ztx) {
    return "AProof proof anchored; no execution tx yet.";
  }
  if (r === "agent" && !ztx) {
    return "No execution tx yet.";
  }
  if (cls === "conformant") return railConformantSubline(rail);
  if (cls === "non_conformant") return railNonConformantSubline(rail);
  if (cls === "partial") return "Latest proof is flagged — review before treating it as conformant.";
  if (cls === "unverifiable") return "Latest proof is unverifiable — evidence or preconditions did not support a decisive result.";
  return "";
}

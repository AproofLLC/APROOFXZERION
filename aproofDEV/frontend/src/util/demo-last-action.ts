import type { DemoScenarioActionKind } from "../constants/demo-scenario";
import {
  classifyEngineProofOutcome,
  outcomeShortLabel,
  type DemoOutcomeClass,
} from "./demo-proof-outcome";

function outcomeClause(cls: DemoOutcomeClass, rail: string): string {
  const r = rail?.trim() || "system";
  if (cls === "conformant") {
    if (r === "model") return "latest proof conformant — identity, policy, and ops baselines held.";
    if (r === "agent") return "latest proof conformant — policy and operational baselines held.";
    if (r === "service") return "latest proof conformant — policy and operational baselines held.";
    if (r === "endpoint") return "latest proof conformant — access and operational baselines held.";
    return "latest proof conformant — policy, operations, and cross-system baselines held.";
  }
  if (cls === "non_conformant") {
    if (r === "endpoint") return "latest proof violated — access or operational baseline failed.";
    if (r === "system") return "latest proof violated — policy or cross-system baseline failed.";
    return "latest proof violated — an active baseline did not hold.";
  }
  if (cls === "partial") {
    return "latest proof flagged — confirm angles before relying on it.";
  }
  if (cls === "unverifiable") {
    return "latest proof unverifiable — no decisive pass/fail from the engine.";
  }
  return "latest proof pending — open Proofs for the engine read.";
}

/**
 * One line for the demo shell: scenario name + proof outcome (no button intent).
 * `snapshotStatus` is overview `latest_proof_snapshot.status` (e.g. conformant / violated).
 */
export function formatDemoLastActionLine(
  rail: string,
  kind: DemoScenarioActionKind | "full_reset",
  snapshotStatus: string | null | undefined,
): string {
  const cls = classifyEngineProofOutcome(snapshotStatus);
  const short = outcomeShortLabel(snapshotStatus);
  const tail = outcomeClause(cls, rail);

  const scenario =
    kind === "clean_proof"
      ? "Authorized Execution scenario"
      : kind === "failure"
        ? "Blocked Execution scenario"
        : kind === "version_update"
          ? "Execution Continuity scenario"
          : "Demo reset";

  if (kind === "version_update") {
    if (cls === "conformant") {
      return `Last action: ${scenario} → lineage advanced; latest proof ${short} under the same governed identity.`;
    }
    return `Last action: ${scenario} → ${tail}`;
  }

  if (kind === "full_reset") {
    return `Last action: ${scenario} → workspace restored; latest proof ${short}.`;
  }

  return `Last action: ${scenario} → ${tail}`;
}

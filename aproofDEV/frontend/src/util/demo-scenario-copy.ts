/** Product-language helpers for demo mode — rail-scoped intros, not proof outcomes (those use engine-driven helpers). */

export function demoFailurePanelIntro(rail: string): string {
  const r = rail?.trim() || "system";
  if (r === "model")
    return "Each row ties a non-conformant result to a specific baseline angle (identity, policy, or operations) and the proof that captured it.";
  if (r === "agent")
    return "Each row ties a non-conformant agent run to the baseline angle that failed—usually policy or operational health.";
  if (r === "service")
    return "Each row ties a service action to the policy or operational rule that did not hold.";
  if (r === "endpoint")
    return "Each row ties an API request failure to access or operational expectations for this endpoint.";
  return "Each row ties a system-level inconsistency to the cross-system or policy/operational baseline that failed.";
}

export function demoTraceabilityIntro(): string {
  return "Lineage is governed continuity: every version references the same logical artifact, so version progression stays provable under the same identity chain—proofs attach per step.";
}

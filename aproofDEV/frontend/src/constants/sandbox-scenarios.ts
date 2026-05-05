/** Mirrors `SANDBOX_SCENARIO_TEMPLATES` in APROOF `sandbox-scenario-runner.ts`. */
export const SANDBOX_SCENARIO_TEMPLATES = [
  "clean_first_proof",
  "mixed_pass_fail",
  "baseline_gap",
  "identity_mismatch",
  "policy_violation",
  "lineage_version_bump",
  "governed_model_response",
  "demo_all_rails",
] as const;

export type SandboxScenarioTemplate = (typeof SANDBOX_SCENARIO_TEMPLATES)[number];

/** Display-only labels — API still receives the raw template id. */
export const SANDBOX_SCENARIO_LABELS: Record<SandboxScenarioTemplate, string> = {
  clean_first_proof: "Clean proof (recommended)",
  mixed_pass_fail: "Mixed pass/fail",
  baseline_gap: "Missing baseline",
  identity_mismatch: "Identity mismatch",
  policy_violation: "Policy violation",
  lineage_version_bump: "Version progression",
  governed_model_response: "Governed model response",
  demo_all_rails: "Multi-subject demo (all rails)",
};

export function getSandboxScenarioLabel(templateId: string | null | undefined): string {
  if (!templateId || templateId.trim() === "") return "";
  if ((SANDBOX_SCENARIO_TEMPLATES as readonly string[]).includes(templateId)) {
    return SANDBOX_SCENARIO_LABELS[templateId as SandboxScenarioTemplate];
  }
  return templateId;
}

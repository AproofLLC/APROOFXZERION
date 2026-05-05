/**
 * Curated demo templates (API ids). Button labels in the UI are fixed product copy;
 * these map to real sandbox scenario ids on the backend.
 */
export const DEMO_ENTRY_TEMPLATE = "demo_all_rails" as const;

/** Template for empty multi-subject demo session + full reset. Targeted actions add `demo_rail` + `demo_action` on POST /sandbox/reset. */
export const DEMO_MULTI_SUBJECT_TEMPLATE = "demo_all_rails" as const;

export const DEMO_SCENARIO_TEMPLATE = {
  /** Full demo reset (clears generated events/proofs and keeps five prepared rails). */
  resetDefault: "demo_all_rails",
  /** Backend-supported; not shown on the primary Demo Controls strip. */
  governedModel: "governed_model_response",
} as const;

/**
 * User-facing subject-type labels. Backend may still use `llm` or `model`; we show "Model" for both.
 * POST /subjects from the UI uses only {@link USER_CREATABLE_SUBJECT_TYPES} (no duplicate llm vs model).
 */
export function userFacingSubjectType(type: string | null | undefined): string {
  const t = (type ?? "").trim().toLowerCase();
  if (t === "llm" || t === "model") return "Model";
  const map: Record<string, string> = {
    agent: "Agent",
    service: "Service",
    endpoint: "Endpoint",
    system: "System",
  };
  return map[t] ?? (type && type.length > 0 ? type : "—");
}

/** Values accepted by POST /subjects — canonical user choice is `model` (not `llm`). */
export const USER_CREATABLE_SUBJECT_TYPES = ["model", "agent", "service", "endpoint", "system"] as const;
export type UserCreatableSubjectType = (typeof USER_CREATABLE_SUBJECT_TYPES)[number];

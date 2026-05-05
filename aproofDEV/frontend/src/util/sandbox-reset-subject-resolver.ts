import { readPreferredSandboxSubjectId, readSandboxSubjectIdsByRail } from "./sandbox-bootstrap-storage";

function isRailSubjectMap(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  for (const [, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x !== "string" || x.length === 0) return false;
  }
  return Object.keys(v as object).length > 0;
}

/**
 * Prefer backend response body, then session map written by persistSandboxClientStateFromApiBody.
 */
export function resolveSubjectIdAfterSandboxMutation(
  data: unknown,
  ctx: { mode: "full" | "targeted"; demoRail: string; priorSubjectId: string },
): string {
  const o = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const fromBody = o?.subject_ids_by_rail;
  const byRailBody = isRailSubjectMap(fromBody) ? fromBody : null;
  const byRailStored = readSandboxSubjectIdsByRail();

  if (ctx.mode === "full") {
    const primary =
      o && typeof o.primary_subject_id === "string" && o.primary_subject_id.length > 0
        ? o.primary_subject_id
        : null;
    if (primary) return primary;
    const modelFirst = byRailBody?.model ?? byRailStored?.model;
    if (typeof modelFirst === "string" && modelFirst.length > 0) return modelFirst;
    return ctx.priorSubjectId;
  }

  const railId =
    (byRailBody && byRailBody[ctx.demoRail]) ||
    (byRailStored && byRailStored[ctx.demoRail]) ||
    null;
  if (typeof railId === "string" && railId.length > 0) return railId;

  const primary =
    o && typeof o.primary_subject_id === "string" && o.primary_subject_id.length > 0
      ? o.primary_subject_id
      : null;
  if (primary) return primary;
  const pref = readPreferredSandboxSubjectId();
  if (pref) return pref;
  return ctx.priorSubjectId;
}

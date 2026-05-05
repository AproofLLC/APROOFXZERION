import {
  SESSION_SANDBOX_PRIMARY_SUBJECT_KEY,
  SESSION_SANDBOX_SUBJECT_MAP_KEY,
  SESSION_SANDBOX_TEMPLATE_KEY,
} from "../constants/storage-keys";

function isRailSubjectMap(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  for (const [, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x !== "string" || x.length === 0) return false;
  }
  return Object.keys(v as object).length > 0;
}

/** Persist template + primary subject from POST /sandbox/session or /sandbox/reset JSON body. */
export function persistSandboxClientStateFromApiBody(data: unknown): void {
  try {
    if (!data || typeof data !== "object") return;
    const o = data as Record<string, unknown>;
    const t = o.template;
    if (typeof t === "string" && t.length > 0) {
      sessionStorage.setItem(SESSION_SANDBOX_TEMPLATE_KEY, t);
    }
    const pid = o.primary_subject_id;
    if (typeof pid === "string" && pid.length > 0) {
      sessionStorage.setItem(SESSION_SANDBOX_PRIMARY_SUBJECT_KEY, pid);
    }
    const byRail = o.subject_ids_by_rail;
    if (isRailSubjectMap(byRail)) {
      sessionStorage.setItem(SESSION_SANDBOX_SUBJECT_MAP_KEY, JSON.stringify(byRail));
    }
  } catch {
    /* sessionStorage unavailable */
  }
}

export function readPreferredSandboxSubjectId(): string | null {
  try {
    const v = sessionStorage.getItem(SESSION_SANDBOX_PRIMARY_SUBJECT_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function clearSandboxClientState(): void {
  try {
    sessionStorage.removeItem(SESSION_SANDBOX_TEMPLATE_KEY);
    sessionStorage.removeItem(SESSION_SANDBOX_PRIMARY_SUBJECT_KEY);
    sessionStorage.removeItem(SESSION_SANDBOX_SUBJECT_MAP_KEY);
  } catch {
    /* ignore */
  }
}

export function readSandboxSubjectIdsByRail(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_SANDBOX_SUBJECT_MAP_KEY);
    if (!raw || raw.length === 0) return null;
    const p = JSON.parse(raw) as unknown;
    return isRailSubjectMap(p) ? p : null;
  } catch {
    return null;
  }
}

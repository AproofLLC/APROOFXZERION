import type { SubjectUserLog, SubjectUserLogsResponse } from "./types";

export function normalizeSubjectUserLogsResponse(input: SubjectUserLogsResponse): {
  logs: SubjectUserLog[];
  next_cursor: string | undefined;
} {
  const logs = Array.isArray(input.logs) ? input.logs : Array.isArray(input.items) ? input.items : [];
  const next_cursor = input.pagination?.next_cursor ?? input.next_cursor ?? undefined;
  return { logs, next_cursor };
}

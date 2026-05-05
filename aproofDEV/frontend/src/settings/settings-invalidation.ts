import type { QueryClient } from "@tanstack/react-query";

/**
 * Settings / control-plane writes update the server source of truth. Callers must invalidate
 * dependent read models so the shell, subject views, and ingest examples all rebind to fresh
 * state (no stale tabs/cards after a settings mutation or successful test ingest).
 */
export async function invalidateControlPlaneForSubject(
  qc: QueryClient,
  subjectId: string | undefined,
  opts?: { session?: boolean; subjectsList?: boolean },
): Promise<void> {
  if (opts?.session) {
    await qc.invalidateQueries({ queryKey: ["session"] });
  }
  if (opts?.subjectsList) {
    await qc.invalidateQueries({ queryKey: ["subjects"] });
  }
  if (!subjectId) return;
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["subjects", subjectId, "integration-status"] }),
    qc.invalidateQueries({ queryKey: ["subjects", subjectId, "integration-bootstrap"] }),
    qc.invalidateQueries({ queryKey: ["subjects", subjectId, "mappings"] }),
    qc.invalidateQueries({ queryKey: ["overview", subjectId] }),
  ]);
}

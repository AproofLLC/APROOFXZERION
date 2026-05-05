import type { QueryClient } from "@tanstack/react-query";

const PREFIX_KEYS = ["overview", "proofs", "events", "failures", "lineages"] as const;

/**
 * Await refetch of subject-scoped queries so the demo shell can settle after sandbox reset
 * without relying on invalidation races alone.
 */
export async function refetchSubjectScopedQueries(qc: QueryClient, subjectId: string): Promise<void> {
  await qc.refetchQueries({
    predicate: (q) => {
      const k = q.queryKey;
      if (!Array.isArray(k) || k.length < 2) return false;
      const head = k[0];
      if (typeof k[1] !== "string" || k[1] !== subjectId) return false;
      if ((PREFIX_KEYS as readonly string[]).includes(head as string)) return true;
      if (head === "baselines") return true;
      if (head === "baseline") return true;
      if (head === "subjects") return true;
      if (head === "subject-user-log-summary") return true;
      if (head === "subject-user-logs") return true;
      return false;
    },
  });
}

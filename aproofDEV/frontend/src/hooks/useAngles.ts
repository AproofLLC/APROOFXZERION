import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { AngleSummary } from "../api/types";

export function useAngles(subjectId: string | undefined) {
  return useQuery({
    queryKey: ["baselines", subjectId],
    queryFn: async () => {
      const res = await apiFetch<{ baselines: AngleSummary[] }>(`/subjects/${subjectId}/baselines`);
      return res.baselines ?? [];
    },
    enabled: Boolean(subjectId),
    /** Baselines must track subject switches and external edits; avoid stale tab paint. */
    staleTime: 0,
    refetchOnMount: "always",
  });
}

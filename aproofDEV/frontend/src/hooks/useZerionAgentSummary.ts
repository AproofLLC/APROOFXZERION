import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { ZerionAgentSummaryResponse } from "../api/types";

export function useZerionAgentSummary(subjectId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["zerion-agent-summary", subjectId],
    queryFn: () => apiFetch<ZerionAgentSummaryResponse>(`/subjects/${subjectId}/zerion-agent-summary`),
    enabled: Boolean(subjectId) && enabled,
    throwOnError: false,
    retry: 1,
  });
}

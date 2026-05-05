import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { SubjectOverview } from "../api/types";

export function useOverview(subjectId: string | undefined) {
  return useQuery({
    queryKey: ["overview", subjectId],
    queryFn: () => apiFetch<SubjectOverview>(`/subjects/${subjectId}/overview`),
    enabled: Boolean(subjectId),
    throwOnError: false,
    retry: 1,
  });
}

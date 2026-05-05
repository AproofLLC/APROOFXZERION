import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { SubjectUserLogSummary } from "../api/types";

export function useUserLogSummary(subjectId: string | undefined) {
  return useQuery({
    queryKey: ["subject-user-log-summary", subjectId],
    queryFn: () => apiFetch<SubjectUserLogSummary>(`/subjects/${subjectId}/user-logs/summary`),
    enabled: Boolean(subjectId),
  });
}

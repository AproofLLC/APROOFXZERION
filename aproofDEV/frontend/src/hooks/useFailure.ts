import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { FailureDetail } from "../api/types";

export function useFailure(failureId: string | undefined) {
  return useQuery({
    queryKey: ["failure", failureId],
    queryFn: () => apiFetch<FailureDetail>(`/failures/${failureId}`),
    enabled: Boolean(failureId),
  });
}

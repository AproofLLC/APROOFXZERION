import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { AngleDetail } from "../api/types";

export function useBaselineDetail(subjectId: string | undefined, angle: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["baselines", subjectId, "detail", angle],
    queryFn: async () => {
      return apiFetch<AngleDetail>(`/subjects/${subjectId}/baselines/${angle}`);
    },
    enabled: Boolean(subjectId && angle && enabled),
  });
}

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { AngleDetail } from "../api/types";

export function useAngle(subjectId: string | undefined, angle: string | undefined) {
  return useQuery({
    queryKey: ["baseline", subjectId, angle],
    queryFn: () => apiFetch<AngleDetail>(`/subjects/${subjectId}/baselines/${encodeURIComponent(angle!)}`),
    enabled: Boolean(subjectId && angle),
  });
}

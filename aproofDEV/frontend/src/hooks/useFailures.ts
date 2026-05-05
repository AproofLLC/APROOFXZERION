import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { FailureListItem, PageMeta } from "../api/types";

export function useFailures(subjectId: string | undefined, limit = 100, offset = 0) {
  return useQuery({
    queryKey: ["failures", subjectId, limit, offset],
    queryFn: () =>
      apiFetch<{ items: FailureListItem[]; page: PageMeta }>(
        `/subjects/${subjectId}/failures?limit=${limit}&offset=${offset}`,
      ),
    enabled: Boolean(subjectId),
  });
}

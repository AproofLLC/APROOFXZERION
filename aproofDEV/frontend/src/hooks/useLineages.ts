import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { LineageListItem, PageMeta } from "../api/types";

export function useLineages(subjectId: string | undefined, limit = 100, offset = 0) {
  return useQuery({
    queryKey: ["lineages", subjectId, limit, offset],
    queryFn: () =>
      apiFetch<{ items: LineageListItem[]; page: PageMeta }>(
        `/subjects/${subjectId}/lineages?limit=${limit}&offset=${offset}`,
      ),
    enabled: Boolean(subjectId),
  });
}

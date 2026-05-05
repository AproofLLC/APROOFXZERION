import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { EventListItem, PageMeta } from "../api/types";

export function useEvents(subjectId: string | undefined, limit = 100, offset = 0) {
  return useQuery({
    queryKey: ["events", subjectId, limit, offset],
    queryFn: () =>
      apiFetch<{ items: EventListItem[]; page: PageMeta }>(
        `/subjects/${subjectId}/events?limit=${limit}&offset=${offset}`,
      ),
    enabled: Boolean(subjectId),
  });
}

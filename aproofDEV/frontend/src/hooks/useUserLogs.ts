import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { normalizeSubjectUserLogsResponse } from "../api/user-logs";
import type { SubjectUserLogsResponse } from "../api/types";

export type UserLogListFilters = {
  q?: string;
  action_type?: string;
  relation?: "" | "any" | "none" | "has_proof" | "has_event" | "has_lineage";
  sort?: "newest" | "oldest";
  limit?: number;
};

export function useUserLogs(subjectId: string | undefined, filters: UserLogListFilters) {
  const sort = filters.sort ?? "newest";
  const limit = filters.limit ?? 50;

  return useInfiniteQuery({
    queryKey: ["subject-user-logs", subjectId, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.q?.trim()) params.set("q", filters.q.trim());
      if (filters.action_type?.trim()) params.set("action_type", filters.action_type.trim());
      const rel = filters.relation?.trim();
      if (rel) params.set("relation", rel);
      params.set("sort", sort);
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", pageParam);
      const qs = params.toString();
      const response = await apiFetch<SubjectUserLogsResponse>(
        `/subjects/${subjectId}/user-logs${qs ? `?${qs}` : ""}`,
      );
      const normalized = normalizeSubjectUserLogsResponse(response);
      return { items: normalized.logs, next_cursor: normalized.next_cursor };
    },
    getNextPageParam: (last) => last.next_cursor,
    enabled: Boolean(subjectId),
  });
}

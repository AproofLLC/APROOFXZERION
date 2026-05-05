import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { PageMeta, Subject } from "../api/types";

export function useSubjectsList(limit = 100, offset = 0, enabled = true) {
  return useQuery({
    queryKey: ["subjects", limit, offset],
    queryFn: () =>
      apiFetch<{ items: Subject[]; page: PageMeta }>(`/subjects?limit=${limit}&offset=${offset}`),
    enabled,
  });
}

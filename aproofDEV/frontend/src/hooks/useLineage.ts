import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { LineageDetail } from "../api/types";

export function useLineage(lineageId: string | undefined) {
  return useQuery({
    queryKey: ["lineage", lineageId],
    queryFn: () => apiFetch<LineageDetail>(`/lineages/${lineageId}`),
    enabled: Boolean(lineageId),
  });
}

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { PageMeta, ProofListItem } from "../api/types";

export function useProofs(subjectId: string | undefined, limit = 100, offset = 0) {
  return useQuery({
    queryKey: ["proofs", subjectId, limit, offset],
    queryFn: () =>
      apiFetch<{ items: ProofListItem[]; page: PageMeta }>(
        `/subjects/${subjectId}/proofs?limit=${limit}&offset=${offset}`,
      ),
    enabled: Boolean(subjectId),
  });
}

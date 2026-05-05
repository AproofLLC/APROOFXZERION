import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { ProofDetailEnvelope } from "../api/types";

export function useProof(proofId: string | undefined) {
  return useQuery({
    queryKey: ["proof", proofId],
    queryFn: () => apiFetch<ProofDetailEnvelope>(`/proofs/${proofId}`),
    enabled: Boolean(proofId),
  });
}

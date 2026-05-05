import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { AngleSummary } from "../api/types";

export type BaselineAnglePatch = Partial<{
  enabled: boolean;
  required: boolean;
  default_origin: "auto" | "user";
  config: Record<string, unknown>;
}>;

export function useUpdateBaselines(subjectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (angles: Record<string, BaselineAnglePatch>) => {
      const res = await apiFetch<{ baselines: AngleSummary[] }>(`/subjects/${subjectId}/baselines`, {
        method: "PATCH",
        body: JSON.stringify({ angles }),
      });
      return res.baselines;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["baselines", subjectId] });
      await qc.invalidateQueries({ queryKey: ["overview", subjectId] });
      await qc.invalidateQueries({ queryKey: ["proofs", subjectId] });
    },
  });
}

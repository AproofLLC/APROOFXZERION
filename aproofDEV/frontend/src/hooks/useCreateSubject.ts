import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { Subject } from "../api/types";

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subject_type: string) =>
      apiFetch<Subject>("/subjects", {
        method: "POST",
        body: JSON.stringify({ subject_type }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

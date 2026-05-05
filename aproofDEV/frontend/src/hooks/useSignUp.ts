import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; organization_name: string }) =>
      apiFetch<{ ok: boolean }>("/auth/sign-up", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["session"] });
      await qc.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { Session } from "../api/types";
import { clearSandboxClientState } from "../util/sandbox-bootstrap-storage";

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/auth/sign-out", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      clearSandboxClientState();
      qc.setQueryData<Session | null>(["session"], null);
      qc.removeQueries({ queryKey: ["subjects"] });
      qc.removeQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["session"] });
    },
  });
}

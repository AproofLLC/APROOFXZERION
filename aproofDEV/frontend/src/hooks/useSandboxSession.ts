import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { persistSandboxClientStateFromApiBody } from "../util/sandbox-bootstrap-storage";

export type SandboxSessionInput = {
  organization_name?: string;
  /** Deterministic scenario; omit for testnet session without seeded events. */
  template?: string;
};

export function useSandboxSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SandboxSessionInput = {}) => {
      const body: Record<string, unknown> = {
        organization_name: input.organization_name ?? "Sandbox Org",
      };
      if (input.template && input.template.trim().length > 0) {
        body.template = input.template.trim();
      }
      return apiFetch<unknown>("/sandbox/session", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async (data) => {
      persistSandboxClientStateFromApiBody(data);
      qc.removeQueries({ queryKey: ["overview"] });
      qc.removeQueries({ queryKey: ["proofs"] });
      qc.removeQueries({ queryKey: ["events"] });
      qc.removeQueries({ queryKey: ["failures"] });
      qc.removeQueries({ queryKey: ["lineages"] });
      qc.removeQueries({ queryKey: ["baselines"] });
      qc.removeQueries({ queryKey: ["baseline"] });
      qc.removeQueries({ queryKey: ["proof"] });
      qc.removeQueries({ queryKey: ["failure"] });
      qc.removeQueries({ queryKey: ["lineage"] });
      qc.removeQueries({ queryKey: ["demo-state"] });
      qc.removeQueries({ queryKey: ["subject-user-log-summary"] });
      qc.removeQueries({ queryKey: ["subject-user-logs"] });
      await qc.invalidateQueries({ queryKey: ["session"] });
      await qc.invalidateQueries({ queryKey: ["subjects"] });
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

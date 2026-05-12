import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { DEMO_MULTI_SUBJECT_TEMPLATE } from "../constants/demo-curated";
import { persistSandboxClientStateFromApiBody } from "../util/sandbox-bootstrap-storage";

export type DemoSandboxAction = "clean_proof" | "failure" | "version_update";

export type SandboxResetInput =
  | { mode: "full"; template: string }
  | { mode: "targeted"; demo_rail: string; demo_action: DemoSandboxAction };

/**
 * Clears testnet generated data or appends deterministic scenario events (cookie session).
 * Full mode returns the demo to an empty prepared workspace; targeted mode appends one Zerion Agent scenario.
 */
export function useSandboxReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SandboxResetInput) => {
      if (input.mode === "full") {
        return apiFetch<unknown>("/sandbox/reset", {
          method: "POST",
          body: JSON.stringify({ template: input.template }),
        });
      }
      return apiFetch<unknown>("/sandbox/reset", {
        method: "POST",
        body: JSON.stringify({
          template: DEMO_MULTI_SUBJECT_TEMPLATE,
          demo_rail: input.demo_rail,
          demo_action: input.demo_action,
        }),
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
      qc.removeQueries({ queryKey: ["sandbox", "zerion-readiness"] });
      qc.removeQueries({ queryKey: ["subject-user-log-summary"] });
      qc.removeQueries({ queryKey: ["subject-user-logs"] });
      await qc.invalidateQueries({ queryKey: ["session"] });
      await qc.invalidateQueries({ queryKey: ["subjects"] });
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

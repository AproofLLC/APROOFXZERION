import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

export type AnchorMvpReadout = {
  default_chain_name: string;
  /** Added in solana-sandbox readout; absent on older servers. */
  network_family?: "Solana";
  route?: "solana-sandbox";
  cluster?: string;
  pending_queued_count: number;
  in_batch_pending_count: number;
  mvp_policy: {
    mode: "server_managed";
    batch_window_user_configurable: false;
    description: string;
  };
  latest_batch: null | {
    anchor_id?: string;
    batch_id: string;
    batch_hash: string;
    root_hash: string;
    chain_name: string;
    chain_family: string;
    cluster: string;
    anchor_payload: string | null;
    simulated_signature: string;
    simulated_slot: string;
    simulated_commitment: string;
    external_attested: boolean;
    tx_ref: string | null;
    tx_signature?: string | null;
    explorer_url?: string | null;
    wallet_public_key?: string | null;
    confirmation_status?: string | null;
    error_message?: string | null;
    network?: string;
    anchor_mode?: string;
    anchor_metadata?: Record<string, unknown>;
    status: string;
    proof_count: number;
    created_at: string;
    anchored_at: string | null;
  };
};

export type IntegrationStatus = {
  baselines_ready: boolean;
  mapping_ready: boolean;
  mapping_is_default_only: boolean;
  api_key_present: boolean;
  last_event_at: string | null;
  last_proof_at: string | null;
  last_failure_at: string | null;
  anchor_state_summary: {
    queued: number;
    batched: number;
    submitted: number;
    confirmed: number;
    failed: number;
  };
  /** Present on current API; absent if an older server is behind the UI. */
  anchor_readout?: AnchorMvpReadout;
};

export function useIntegrationStatus(subjectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["subjects", subjectId, "integration-status"],
    queryFn: () => apiFetch<IntegrationStatus>(`/subjects/${subjectId}/integration-status`),
    enabled: Boolean(subjectId) && enabled,
  });
}

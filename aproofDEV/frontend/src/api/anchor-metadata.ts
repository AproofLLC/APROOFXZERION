export type CanonicalAnchorMetadata = {
  anchor_id: string | null;
  batch_id: string | null;
  root_hash: string | null;
  proof_count: number | null;
  proof_ids: string[];
  network: string | null;
  cluster: string | null;
  anchor_mode: string | null;
  tx_signature: string | null;
  explorer_url: string | null;
  wallet_public_key: string | null;
  status: "pending" | "confirmed" | "failed" | "mocked" | "disabled";
  confirmation_status: string | null;
  anchored_at: string | null;
  created_at: string | null;
  error_message: string | null;
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export function normalizeAnchorMetadataFromApi(input: unknown): CanonicalAnchorMetadata {
  const i = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const tx = asString(i.tx_signature) ?? asString(i.anchor_tx_hash);
  /** Prefer proof-record `anchor_batch_id` over normalized `batch_id` so UI matches `product_proof` (Summary). */
  const batch = asString(i.anchor_batch_id) ?? asString(i.batch_id) ?? asString(i.anchor_id);
  const rawNetwork = asString(i.network) ?? asString(i.anchor_chain);
  const rawMode = asString(i.anchor_mode);
  const mode =
    rawMode === "solana-devnet" || rawMode === "sandbox" || rawMode === "mock" || rawMode === "disabled"
      ? rawMode
      : (rawNetwork === "solana-devnet" ? "solana-devnet" : "mock");
  const network =
    mode === "solana-devnet"
      ? "solana-devnet"
      : mode === "sandbox"
        ? "sandbox"
        : mode === "disabled"
          ? "sandbox"
          : "mock";
  const anchoredAt = asString(i.anchored_at) ?? asString(i.anchor_timestamp);
  const explicitStatus = asString(i.status);
  const status: "pending" | "confirmed" | "failed" | "mocked" | "disabled" =
    explicitStatus === "pending" ||
    explicitStatus === "confirmed" ||
    explicitStatus === "failed" ||
    explicitStatus === "mocked" ||
    explicitStatus === "disabled"
      ? explicitStatus
      : asString(i.error_message)
        ? "failed"
        : mode === "disabled"
          ? "disabled"
          : tx
            ? (mode === "solana-devnet" ? "confirmed" : "mocked")
            : batch
              ? (mode === "solana-devnet" ? "pending" : "mocked")
              : (mode === "solana-devnet" ? "pending" : "mocked");
  const explorer = mode === "solana-devnet" && tx ? asString(i.explorer_url) : null;
  const wallet = mode === "solana-devnet" && tx ? asString(i.wallet_public_key) : null;
  return {
    anchor_id: asString(i.anchor_id) ?? batch,
    batch_id: batch,
    root_hash: asString(i.root_hash) ?? asString(i.anchor_root_hash),
    proof_count: typeof i.proof_count === "number" ? i.proof_count : null,
    proof_ids: Array.isArray(i.proof_ids) ? i.proof_ids.filter((x): x is string => typeof x === "string") : [],
    network,
    cluster: mode === "solana-devnet" ? (asString(i.cluster) ?? "devnet") : null,
    anchor_mode: mode,
    tx_signature: tx,
    explorer_url: explorer,
    wallet_public_key: wallet,
    status,
    confirmation_status: asString(i.confirmation_status),
    anchored_at: anchoredAt,
    created_at: asString(i.created_at),
    error_message: asString(i.error_message),
  };
}

export function shortHash(value: string | null, prefix = 8, suffix = 8): string {
  if (!value) return "—";
  if (value.length <= prefix + suffix + 1) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}

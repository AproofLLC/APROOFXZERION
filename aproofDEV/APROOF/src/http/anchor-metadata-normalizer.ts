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

type LooseInput = Record<string, unknown> | null | undefined;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function deriveStatus(
  input: LooseInput,
  defaults?: { anchoringEnabled?: boolean },
): "pending" | "confirmed" | "failed" | "mocked" | "disabled" {
  const i = input ?? {};
  const explicit = asString(i.status);
  if (
    explicit === "pending" ||
    explicit === "confirmed" ||
    explicit === "failed" ||
    explicit === "mocked" ||
    explicit === "disabled"
  ) {
    return explicit;
  }
  const hasTx = Boolean(asString(i.tx_signature) ?? asString(i.anchor_tx_hash) ?? asString(i.tx_ref));
  const hasBatch = Boolean(asString(i.batch_id) ?? asString(i.anchor_batch_id));
  const mode = asString(i.anchor_mode) ?? (defaults?.anchoringEnabled ? "solana-devnet" : "mock");
  const anchorStatus = asString(i.anchor_status);
  if (anchorStatus === "anchor_failed") return "failed";
  if (mode === "solana-devnet") {
    if (anchorStatus === "anchored") return "confirmed";
    if (anchorStatus === "batched") return "pending";
  }
  if (asString(i.error_message)) return "failed";
  if (mode === "disabled") return "disabled";
  if ((mode === "sandbox" || mode === "mock") && !hasTx) return "mocked";
  if (!hasTx && !hasBatch) return mode === "solana-devnet" ? "pending" : "mocked";
  if (hasTx && mode !== "solana-devnet") return "mocked";
  if (hasTx && mode === "solana-devnet") return "confirmed";
  return "pending";
}

export function normalizeAnchorMetadata(
  input: LooseInput,
  options?: { anchoringEnabled?: boolean },
): CanonicalAnchorMetadata {
  const i = input ?? {};
  const anchor_id = asString(i.anchor_id) ?? asString(i.id) ?? asString(i.anchor_batch_id);
  const batch_id = asString(i.batch_id) ?? anchor_id;
  const tx_signature = asString(i.tx_signature) ?? asString(i.anchor_tx_hash) ?? asString(i.tx_ref);
  const anchored_at = asString(i.anchored_at) ?? asString(i.anchor_timestamp);
  const rawNetwork = asString(i.network) ?? asString(i.anchor_chain) ?? asString(i.chain_name);
  const rawMode = asString(i.anchor_mode);
  const anchor_mode =
    rawMode === "solana-devnet" || rawMode === "sandbox" || rawMode === "mock" || rawMode === "disabled"
      ? rawMode
      : (rawNetwork === "solana-devnet" ? "solana-devnet" : "mock");
  const network =
    anchor_mode === "solana-devnet"
      ? "solana-devnet"
      : anchor_mode === "sandbox"
        ? "sandbox"
        : anchor_mode === "disabled"
          ? "sandbox"
          : "mock";
  const cluster = anchor_mode === "solana-devnet" ? (asString(i.cluster) ?? "devnet") : null;
  const explorer_url_raw = asString(i.explorer_url) ?? asString(i.anchor_explorer_url);
  const wallet_public_key_raw = asString(i.wallet_public_key) ?? asString(i.anchor_wallet_public_key);
  const explorer_url = anchor_mode === "solana-devnet" && tx_signature ? explorer_url_raw : null;
  const wallet_public_key = anchor_mode === "solana-devnet" && tx_signature ? wallet_public_key_raw : null;
  return {
    anchor_id,
    batch_id,
    root_hash: asString(i.root_hash) ?? asString(i.anchor_root_hash),
    proof_count: asNumber(i.proof_count) ?? asNumber(i.anchor_proof_count),
    proof_ids: asStringArray(i.proof_ids ?? i.anchor_proof_ids),
    network,
    cluster,
    anchor_mode,
    tx_signature,
    explorer_url,
    wallet_public_key,
    status: deriveStatus(i, options),
    confirmation_status: asString(i.confirmation_status) ?? asString(i.anchor_confirmation_status),
    anchored_at,
    created_at: asString(i.created_at),
    error_message: asString(i.error_message) ?? asString(i.anchor_error_message),
  };
}

import type { ProductProof } from "../../../api/types";
import { normalizeAnchorMetadataFromApi, shortHash } from "../../../api/anchor-metadata";
import { Badge } from "../ui/badge";
import { TruthRow, TruthSection, truthJson, truthScalar } from "./truth-display";

export function ProofAnchorMetadataSection({
  pp,
  anchorMetadata,
  variant = "full",
}: {
  pp: ProductProof | undefined;
  anchorMetadata: Record<string, unknown>;
  /** `inline`: omit long copy — used under Traceability version rows (same payload as Proofs tab). */
  variant?: "full" | "inline";
}) {
  const lifecycle =
    typeof anchorMetadata.anchor_state === "string" ? anchorMetadata.anchor_state : null;
  const ssFromMeta = anchorMetadata.solana_sandbox;
  const ss =
    pp?.solana_sandbox ??
    (ssFromMeta && typeof ssFromMeta === "object" && ssFromMeta !== null
      ? (ssFromMeta as ProductProof["solana_sandbox"])
      : undefined);
  const canonical = anchorMetadata as Record<string, unknown>;
  const meta = normalizeAnchorMetadataFromApi({
    ...canonical,
    anchor_chain: pp?.anchor_chain,
    anchor_tx_hash: pp?.anchor_tx_hash,
    anchor_timestamp: pp?.anchor_timestamp,
    anchor_batch_id: pp?.anchor_batch_id,
    anchor_root_hash: pp?.anchor_root_hash,
    proof_count: pp?.anchor_proof_count,
    explorer_url: pp?.anchor_explorer_url,
    wallet_public_key: pp?.anchor_wallet_public_key,
    confirmation_status: pp?.anchor_confirmation_status,
    error_message: pp?.anchor_error_message,
  });
  const badgeLabel =
    meta.status === "confirmed" && meta.network === "solana-devnet"
      ? "Anchored on Solana Devnet"
      : meta.status === "mocked"
        ? meta.network === "sandbox"
          ? "Sandbox anchor"
          : "Mock anchor"
        : meta.status === "failed"
          ? "Anchor failed"
          : meta.status === "disabled"
            ? "Anchor disabled"
            : "Not anchored yet";
  const explorerDisplayHref = pp?.anchor_explorer_url?.trim() || meta.explorer_url?.trim() || null;
  return (
    <TruthSection title={variant === "inline" ? "Anchor metadata" : "G. Anchor metadata"}>
      {!pp ? (
        <div className="text-sm text-muted-foreground">No data</div>
      ) : (
        <>
          {variant === "full" ? (
            <p className="text-xs text-muted-foreground mb-2">
              Displays canonical Solana anchor fields from backend responses only.{" "}
              <span className="text-muted-foreground/90">
                <strong className="text-foreground/85 font-medium">anchor_batch_id</strong> is the database id for the
                anchor batch tied to this proof&apos;s primary unit;{" "}
                <strong className="text-foreground/85 font-medium">root_hash</strong> and{" "}
                <strong className="text-foreground/85 font-medium">solana_sandbox.batch_hash</strong> are cryptographic
                digests for that batch—not a second batch id.
              </span>
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground mb-2">
              Loaded from <span className="font-mono">GET /proofs/:id</span> — same envelope as the Proofs tab for this
              <span className="font-mono"> proof_id</span>.
            </p>
          )}
          {lifecycle ? (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-muted-foreground">Lifecycle</span>
              <Badge variant="outline" className="text-[10px] font-normal">
                {lifecycle}
              </Badge>
            </div>
          ) : null}
          <div className="mb-2">
            <Badge variant={meta.status === "confirmed" ? "default" : "secondary"}>{badgeLabel}</Badge>
          </div>
          <div className="text-xs text-muted-foreground mb-2">Proof → Batch Root → Solana Tx</div>
          <TruthRow label="status" value={truthScalar(meta.status)} />
          <TruthRow label="network" value={truthScalar(meta.network ?? "Not anchored yet")} />
          <TruthRow label="root_hash" value={truthScalar(meta.root_hash ?? "Not anchored yet")} />
          <TruthRow label="proof_count" value={truthScalar(meta.proof_count)} />
          <TruthRow
            label="tx_signature"
            value={truthScalar(meta.tx_signature ? shortHash(meta.tx_signature) : "No Solana transaction")}
          />
          <TruthRow
            label="wallet_public_key"
            value={truthScalar(meta.wallet_public_key ? shortHash(meta.wallet_public_key) : "Not anchored yet")}
          />
          <TruthRow label="confirmation_status" value={truthScalar(meta.confirmation_status ?? "Not anchored yet")} />
          <TruthRow label="anchored_at" value={truthScalar(meta.anchored_at)} />
          <TruthRow
            label="error_message"
            value={truthScalar(meta.error_message ? `Anchor failed: ${meta.error_message}` : null)}
          />
          <TruthRow
            label="explorer_url"
            value={
              explorerDisplayHref ? (
                <a className="underline" href={explorerDisplayHref} target="_blank" rel="noreferrer">
                  View on Solana Explorer →
                </a>
              ) : (
                truthScalar("No Solana transaction")
              )
            }
          />
          <TruthRow label="anchor_batch_id" value={truthScalar(pp.anchor_batch_id ?? meta.batch_id)} />
          {meta.proof_ids.length > 0 ? (
            <div className="pt-2">
              <div className="text-xs text-muted-foreground">proof_ids</div>
              <pre className="p-2 rounded bg-muted/30 text-[11px] whitespace-pre-wrap break-words max-w-full">
                {truthJson(meta.proof_ids)}
              </pre>
            </div>
          ) : null}
          <TruthRow label="anchor_payload" value={truthScalar(anchorMetadata.anchor_payload ?? pp.anchor_payload)} />
          {ss ? (
            <>
              <TruthRow label="solana_sandbox.batch_hash" value={truthScalar(ss.batch_hash)} />
              <TruthRow label="solana_sandbox.simulated_signature" value={truthScalar(ss.simulated_signature)} />
              <TruthRow label="solana_sandbox.simulated_slot" value={truthScalar(ss.simulated_slot)} />
              <TruthRow label="solana_sandbox.simulated_commitment" value={truthScalar(ss.simulated_commitment)} />
              <TruthRow label="solana_sandbox.external_attested" value={truthScalar(String(ss.external_attested))} />
            </>
          ) : meta.network === "solana-devnet" || pp.anchor_chain === "solana-devnet" ? (
            <TruthRow
              label="solana_sandbox"
              value="— Not applicable on Devnet (real transaction — use explorer_url / tx_signature above). This block only appears for the solana-sandbox route; it is not a second anchor."
            />
          ) : (
            <TruthRow label="solana_sandbox" value="— (not linked / not on solana-sandbox batch yet)" />
          )}
          <TruthRow label="proof_digest" value={truthScalar(pp.proof_digest)} />
        </>
      )}
    </TruthSection>
  );
}

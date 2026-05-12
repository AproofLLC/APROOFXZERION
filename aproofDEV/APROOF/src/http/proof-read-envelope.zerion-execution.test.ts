import { describe, expect, it } from "vitest";
import { EXAMPLE_PRODUCT_PROOF } from "../product/product-proof.js";
import { finalizeProductProofForApiResponse, finalizeEnvelopeProductProof } from "./proof-read-envelope.js";

describe("finalizeProductProofForApiResponse (Zerion execution explorer)", () => {
  it("derives zerion_execution_explorer_url from zerion_tx_hash when omitted", () => {
    const tx = "Z".repeat(88);
    const pp = {
      ...EXAMPLE_PRODUCT_PROOF,
      zerion_tx_hash: tx,
      zerion_execution_explorer_url: undefined,
    };
    const out = finalizeProductProofForApiResponse(pp);
    expect(out.zerion_execution_explorer_url).toBe(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  });

  it("does not emit execution explorer when zerion_tx_hash is absent", () => {
    const pp = { ...EXAMPLE_PRODUCT_PROOF, zerion_tx_hash: null, zerion_execution_explorer_url: null };
    const out = finalizeProductProofForApiResponse(pp);
    expect(out.zerion_execution_explorer_url).toBeNull();
  });
});

describe("finalizeEnvelopeProductProof anchor_metadata (execution vs anchor)", () => {
  it("exposes zerion_execution_explorer_url alongside anchor explorer_url on product proof", () => {
    const tx = "Q".repeat(88);
    const anchorSig = "B".repeat(88);
    const anchorExplorer = `https://explorer.solana.com/tx/${anchorSig}?cluster=devnet`;
    const envelope: Record<string, unknown> = {
      failure_intelligence: { failed_angles: [], primary_failure_category: null, primary_failure_summary: null, insights: [] },
      product_proof: {
        ...EXAMPLE_PRODUCT_PROOF,
        zerion_tx_hash: tx,
        anchor_tx_hash: anchorSig,
        anchor_explorer_url: anchorExplorer,
        anchor_chain: "solana-devnet",
        anchor_status: "anchored",
      },
    };
    finalizeEnvelopeProductProof(envelope);
    const meta = envelope.anchor_metadata as Record<string, unknown>;
    expect(meta.zerion_tx_hash).toBe(tx);
    expect(meta.zerion_execution_explorer_url).toBe(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    expect(meta.explorer_url).toBe(anchorExplorer);
  });
});

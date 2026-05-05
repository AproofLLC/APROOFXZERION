import { describe, expect, it } from "vitest";
import { attachFrontendProofEnvelopeFields } from "./proof-read-envelope.js";

describe("anchor metadata envelope contract", () => {
  it("maps legacy anchor fields to canonical metadata", () => {
    const envelope: Record<string, unknown> = {
      failure_intelligence: { failed_angles: [], primary_failure_category: null, primary_failure_summary: null, insights: [] },
      product_proof: {
        proof_status: "verified",
        subject_id: "subj-1",
        angles: [],
        anchor_status: "anchored",
        anchor_batch_id: "batch-1",
        anchor_chain: "solana-devnet",
        anchor_tx_hash: "sig-1",
        anchor_timestamp: "2026-01-01T00:00:00.000Z",
        anchor_root_hash: "root-1",
        anchor_proof_count: 2,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    };
    attachFrontendProofEnvelopeFields(envelope);
    const meta = envelope.anchor_metadata as Record<string, unknown>;
    expect(meta.batch_id).toBe("batch-1");
    expect(meta.network).toBe("solana-devnet");
    expect(meta.tx_signature).toBe("sig-1");
    expect(meta.anchored_at).toBe("2026-01-01T00:00:00.000Z");
    expect(meta.root_hash).toBe("root-1");
    expect(Array.isArray(meta.proof_ids)).toBe(true);
    expect(meta.status).toBe("confirmed");
  });

  it("does not label sandbox/mock as solana-devnet", () => {
    const envelope: Record<string, unknown> = {
      failure_intelligence: { failed_angles: [], primary_failure_category: null, primary_failure_summary: null, insights: [] },
      product_proof: {
        proof_status: "verified",
        subject_id: "subj-1",
        angles: [],
        anchor_status: "anchored",
        anchor_batch_id: "batch-1",
        anchor_chain: "mock",
        anchor_mode: "mock",
        anchor_tx_hash: null,
        anchor_timestamp: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    };
    attachFrontendProofEnvelopeFields(envelope);
    const meta = envelope.anchor_metadata as Record<string, unknown>;
    expect(meta.network).toBe("mock");
    expect(meta.tx_signature).toBeNull();
    expect(meta.explorer_url).toBeNull();
    expect(meta.status).toBe("mocked");
  });
});

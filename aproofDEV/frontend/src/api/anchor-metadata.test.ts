import { describe, expect, it } from "vitest";
import { normalizeAnchorMetadataFromApi } from "./anchor-metadata";

describe("normalizeAnchorMetadataFromApi", () => {
  it("maps canonical data", () => {
    const out = normalizeAnchorMetadataFromApi({
      batch_id: "b1",
      tx_signature: "sig1",
      network: "solana-devnet",
      status: "confirmed",
      proof_ids: ["p1"],
    });
    expect(out.batch_id).toBe("b1");
    expect(out.tx_signature).toBe("sig1");
    expect(out.status).toBe("confirmed");
    expect(out.proof_ids).toEqual(["p1"]);
  });

  it("maps legacy aliases", () => {
    const out = normalizeAnchorMetadataFromApi({
      anchor_batch_id: "b1",
      anchor_tx_hash: "sig1",
      anchor_chain: "solana-devnet",
      anchor_timestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(out.batch_id).toBe("b1");
    expect(out.tx_signature).toBe("sig1");
    expect(out.network).toBe("solana-devnet");
    expect(out.anchored_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps sandbox/mock distinct from devnet", () => {
    const out = normalizeAnchorMetadataFromApi({
      anchor_mode: "sandbox",
      anchor_batch_id: "b1",
      tx_signature: null,
    });
    expect(out.network).toBe("sandbox");
    expect(out.status).toBe("mocked");
    expect(out.explorer_url).toBeNull();
  });

  it("prefers anchor_batch_id over batch_id when both present (proof record wins)", () => {
    const out = normalizeAnchorMetadataFromApi({
      batch_id: "batch-canonical",
      anchor_batch_id: "proof-attached",
    });
    expect(out.batch_id).toBe("proof-attached");
    expect(out.anchor_id).toBe("proof-attached");
  });

  it("uses pending for missing devnet anchor metadata", () => {
    const out = normalizeAnchorMetadataFromApi({
      anchor_mode: "solana-devnet",
      tx_signature: null,
      anchor_batch_id: null,
    });
    expect(out.status).toBe("pending");
  });
});

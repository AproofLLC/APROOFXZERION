import { describe, expect, it } from "vitest";
import { zerionExecutionExplorerUrlFromTxHash } from "./zerion-execution-explorer-url.js";

describe("zerionExecutionExplorerUrlFromTxHash", () => {
  it("builds devnet explorer URL from tx_hash", () => {
    const tx = "A".repeat(88);
    const url = zerionExecutionExplorerUrlFromTxHash(tx, {
      SOLANA_EXPLORER_BASE_URL: "https://explorer.solana.com",
      SOLANA_CLUSTER: "devnet",
    } as NodeJS.ProcessEnv);
    expect(url).toBe(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  });

  it("returns null when tx_hash is missing or too short", () => {
    expect(zerionExecutionExplorerUrlFromTxHash(null)).toBeNull();
    expect(zerionExecutionExplorerUrlFromTxHash(undefined)).toBeNull();
    expect(zerionExecutionExplorerUrlFromTxHash("short")).toBeNull();
    expect(zerionExecutionExplorerUrlFromTxHash("   ")).toBeNull();
  });
});

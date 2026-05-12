import { describe, expect, it } from "vitest";
import { zerionExecutionExplorerUrlFromTxHash } from "./zerion-execution-explorer-url";

describe("zerionExecutionExplorerUrlFromTxHash (frontend)", () => {
  it("returns devnet explorer URL for a long signature", () => {
    const tx = "X".repeat(88);
    expect(zerionExecutionExplorerUrlFromTxHash(tx)).toBe(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  });

  it("returns null when hash missing or too short", () => {
    expect(zerionExecutionExplorerUrlFromTxHash(null)).toBeNull();
    expect(zerionExecutionExplorerUrlFromTxHash("ab")).toBeNull();
  });
});

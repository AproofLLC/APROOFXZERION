import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
  buildCanonicalMemoPayload,
  buildSolanaExplorerUrl,
  ensureDevnetBalanceLamports,
  loadOrCreateAnchorKeypair,
  resolveAnchorMode,
  resolveSolanaDevnetConfig,
} from "./solana-devnet-anchor.js";

describe("solana devnet anchor config", () => {
  it("defaults to mock when ANCHOR_MODE missing", () => {
    expect(resolveAnchorMode({} as NodeJS.ProcessEnv)).toBe("mock");
  });

  it("resolves sandbox/mode variants without claiming devnet", () => {
    expect(resolveAnchorMode({ ANCHOR_MODE: "sandbox" })).toBe("sandbox");
    expect(resolveAnchorMode({ ANCHOR_MODE: "mock" })).toBe("mock");
    expect(resolveAnchorMode({ ANCHOR_MODE: "disabled" })).toBe("disabled");
  });

  it("requires keypair path for solana-devnet mode", () => {
    expect(() =>
      resolveSolanaDevnetConfig({
        ANCHOR_MODE: "solana-devnet",
        SOLANA_RPC_URL: "https://api.devnet.solana.com",
        SOLANA_CLUSTER: "devnet",
      }),
    ).toThrow(/SOLANA_CONFIG_INVALID/);
  });

  it("autocreate false + missing keypair fails clearly", () => {
    expect(() =>
      resolveSolanaDevnetConfig({
        ANCHOR_MODE: "solana-devnet",
        SOLANA_RPC_URL: "https://api.devnet.solana.com",
        SOLANA_CLUSTER: "devnet",
        SOLANA_KEYPAIR_PATH: "Z:/missing/anchor-devnet.json",
      }),
    ).toThrow(/file does not exist/);
  });

  it("autocreate true + missing keypair creates local keypair", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "aproof-solana-"));
    try {
      const cfg = resolveSolanaDevnetConfig({
        ANCHOR_MODE: "solana-devnet",
        SOLANA_RPC_URL: "https://api.devnet.solana.com",
        SOLANA_CLUSTER: "devnet",
        SOLANA_AUTOCREATE_DEVNET_WALLET: "true",
        SOLANA_KEYPAIR_PATH: path.join(dir, "anchor-devnet.json"),
      });
      const kp = await loadOrCreateAnchorKeypair(cfg);
      expect(kp.publicKey.toBase58().length).toBeGreaterThan(20);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("auto-airdrop false does not request airdrop", async () => {
    const kp = Keypair.generate();
    const getBalance = vi.fn().mockResolvedValue(1000);
    const requestAirdrop = vi.fn();
    const confirmTransaction = vi.fn();
    const config = {
      rpcUrl: "https://api.devnet.solana.com",
      cluster: "devnet",
      keypairPath: "x",
      keypairPathAbsolute: "x",
      explorerBaseUrl: "https://explorer.solana.com",
      autoCreateDevnetWallet: false,
      autoAirdropDevnet: false,
      minBalanceLamports: 10000000,
    };
    await expect(
      ensureDevnetBalanceLamports(
        { getBalance, requestAirdrop, confirmTransaction } as any,
        kp,
        config,
      ),
    ).rejects.toThrow(/SOLANA_DEVNET_WALLET_UNFUNDED/);
    expect(requestAirdrop).not.toHaveBeenCalled();
  });

  it("auto-airdrop true requests airdrop when low", async () => {
    const kp = Keypair.generate();
    const getBalance = vi.fn().mockResolvedValueOnce(1000).mockResolvedValueOnce(2000000000);
    const requestAirdrop = vi.fn().mockResolvedValue("sig");
    const confirmTransaction = vi.fn().mockResolvedValue(undefined);
    const config = {
      rpcUrl: "https://api.devnet.solana.com",
      cluster: "devnet",
      keypairPath: "x",
      keypairPathAbsolute: "x",
      explorerBaseUrl: "https://explorer.solana.com",
      autoCreateDevnetWallet: false,
      autoAirdropDevnet: true,
      minBalanceLamports: 10000000,
    };
    await ensureDevnetBalanceLamports(
      { getBalance, requestAirdrop, confirmTransaction } as any,
      kp,
      config,
    );
    expect(requestAirdrop).toHaveBeenCalledOnce();
    expect(confirmTransaction).toHaveBeenCalledWith("sig", "confirmed");
  });

  it("autocreate true + missing keypair defaults to local devnet wallet path", () => {
    const cfg = resolveSolanaDevnetConfig({
      ANCHOR_MODE: "solana-devnet",
      SOLANA_RPC_URL: "https://api.devnet.solana.com",
      SOLANA_CLUSTER: "devnet",
      SOLANA_AUTOCREATE_DEVNET_WALLET: "true",
    });
    expect(cfg.keypairPath.replace(/\\/g, "/")).toBe(".local/solana/anchor-devnet.json");
  });

  it("auto-airdrop true fails clearly when airdrop cannot be confirmed", async () => {
    const kp = Keypair.generate();
    const getBalance = vi.fn().mockResolvedValue(1000);
    const requestAirdrop = vi.fn().mockRejectedValue(new Error("rpc down"));
    const confirmTransaction = vi.fn();
    const config = {
      rpcUrl: "https://api.devnet.solana.com",
      cluster: "devnet",
      keypairPath: "x",
      keypairPathAbsolute: "x",
      explorerBaseUrl: "https://explorer.solana.com",
      autoCreateDevnetWallet: false,
      autoAirdropDevnet: true,
      minBalanceLamports: 10000000,
    };
    await expect(
      ensureDevnetBalanceLamports(
        { getBalance, requestAirdrop, confirmTransaction } as any,
        kp,
        config,
      ),
    ).rejects.toThrow(/SOLANA_DEVNET_ANCHOR_FAILED/);
  });

  it("auto-airdrop true fails when balance still below minimum after airdrop", async () => {
    const kp = Keypair.generate();
    const getBalance = vi.fn().mockResolvedValueOnce(1000).mockResolvedValueOnce(5000);
    const requestAirdrop = vi.fn().mockResolvedValue("sig");
    const confirmTransaction = vi.fn().mockResolvedValue(undefined);
    const config = {
      rpcUrl: "https://api.devnet.solana.com",
      cluster: "devnet",
      keypairPath: "x",
      keypairPathAbsolute: "x",
      explorerBaseUrl: "https://explorer.solana.com",
      autoCreateDevnetWallet: false,
      autoAirdropDevnet: true,
      minBalanceLamports: 10000000,
    };
    await expect(
      ensureDevnetBalanceLamports(
        { getBalance, requestAirdrop, confirmTransaction } as any,
        kp,
        config,
      ),
    ).rejects.toThrow(/SOLANA_DEVNET_WALLET_UNFUNDED/);
  });

  it("rejects mainnet/mainnet-beta cluster", () => {
    expect(() =>
      resolveSolanaDevnetConfig({
        ANCHOR_MODE: "solana-devnet",
        SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
        SOLANA_CLUSTER: "mainnet-beta",
        SOLANA_KEYPAIR_PATH: "x",
      }),
    ).toThrow(/must be devnet/);
  });

  it("builds canonical explorer URL", () => {
    expect(buildSolanaExplorerUrl("abc123", "https://explorer.solana.com", "devnet")).toBe(
      "https://explorer.solana.com/tx/abc123?cluster=devnet",
    );
  });

  it("builds canonical memo payload", () => {
    expect(
      buildCanonicalMemoPayload({
        rootHash: "root",
        proofCount: 3,
        createdAtIso: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      protocol: "aproof",
      anchor_version: "solana-devnet-v1",
      root_hash: "root",
      proof_count: 3,
      subject_scope: "sandbox",
      created_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("generated keypair path is ignored by git patterns", async () => {
    const rootGitignore = await readFile(path.resolve(process.cwd(), "../.gitignore"), "utf8");
    const repoGitignore = await readFile(path.resolve(process.cwd(), ".gitignore"), "utf8");
    const merged = `${rootGitignore}\n${repoGitignore}`;
    expect(merged).toMatch(/\.local\//);
    expect(merged).toMatch(/anchor-devnet\.json/);
  });
});

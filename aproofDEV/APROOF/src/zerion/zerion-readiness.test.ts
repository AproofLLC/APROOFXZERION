import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { buildZerionReadinessSnapshot } from "./zerion-readiness.js";

const here = dirname(fileURLToPath(import.meta.url));

function emptyCwd(): string {
  const dir = join(tmpdir(), `zr-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("buildZerionReadinessSnapshot", () => {
  it("returns presence flags and never exposes secret material", async () => {
    const iso = emptyCwd();
    const snap = await buildZerionReadinessSnapshot(
      {
        ZERION_API_KEY: "sk_live_super_secret",
        ZERION_CLI_PATH: "/nonexistent/cli",
        ZERION_AGENT_WALLET_ADDRESS: "Wallet111",
        SOLANA_RPC_URL: "https://rpc.example",
        ZERION_ALLOWED_CHAIN: "solana-devnet",
        ZERION_MAX_SPEND_USD: "5",
        ZERION_APPROVED_ASSETS: "SOL,USDC",
        APROOF_SUBJECT_ID: "zerion-agent",
        APROOF_ENV: "solana-devnet",
      },
      { cwd: iso },
    );
    const json = JSON.stringify(snap);
    expect(json).not.toContain("sk_live");
    expect(json).not.toContain("super_secret");
    expect(snap.zerion_api_key_present).toBe(true);
    expect(snap.zerion_wallet_address_present).toBe(true);
    expect(snap.solana_rpc_url_present).toBe(true);
    expect(snap.allowed_chain).toBe("solana-devnet");
    expect(snap.max_spend_usd).toBe(5);
    expect(snap.approved_assets).toEqual(["SOL", "USDC"]);
    expect(snap.aproof_subject_id).toBe("zerion-agent");
    expect(snap.agent_wallet_public_address).toBe("Wallet111");
    expect(snap.zerion_cli_is_stub_path).toBe(false);
    expect(snap.missing.length).toBeGreaterThan(0);
    expect(snap.integration_ready).toBe(false);
    expect(snap.what_is_working.length).toBeGreaterThanOrEqual(3);
    expect(snap.what_is_next.length).toBeGreaterThan(0);
    expect(snap.set_execution_wallet_help).toBeNull();
    expect(snap.agent_execution_wallet_balance_lamports).toBeNull();
    expect(snap.zerion_agent_keypair_present).toBe(false);
    expect(snap.zerion_agent_balance_sol).toBeNull();
    expect(snap.zerion_cli_path_env_explicit).toBe(true);
    expect(snap.zerion_agent_wallet_env_explicit).toBe(true);
    expect(snap.readiness_detail.zerion_api_key).toBe("present");
    expect(snap.execution_readiness_blocker).not.toBeNull();
    expect(snap.integration_readiness_blocker).not.toBeNull();
  });

  it("surfaces execution_readiness_blocker when ZERION_API_KEY is missing", async () => {
    const iso = emptyCwd();
    const snap = await buildZerionReadinessSnapshot(
      {
        SOLANA_RPC_URL: "https://rpc.example",
        ZERION_AGENT_WALLET_ADDRESS: "W",
        ZERION_CLI_PATH: "/bin/false",
      },
      { cwd: iso },
    );
    expect(snap.execution_ready).toBe(false);
    expect(snap.execution_readiness_blocker).toContain("ZERION_API_KEY");
    expect(snap.readiness_detail.zerion_api_key).toBe("missing");
  });

  it("surfaces set_execution_wallet_help when execution address is unset and no local keypair", async () => {
    const iso = emptyCwd();
    const snap = await buildZerionReadinessSnapshot(
      {
        ZERION_API_KEY: "k",
        ZERION_CLI_PATH: "/x",
        ZERION_AGENT_WALLET_ADDRESS: "",
        SOLANA_RPC_URL: "https://rpc.example",
        ANCHOR_MODE: "solana-devnet",
      },
      { cwd: iso },
    );
    expect(snap.set_execution_wallet_help).toContain("Generate or configure");
    expect(snap.zerion_wallet_address_present).toBe(false);
  });

  it("marks zerion_cli_is_stub_path when CLI path is the dev stub script", async () => {
    const iso = emptyCwd();
    const kpPath = join(iso, "kp.json");
    writeFileSync(kpPath, JSON.stringify(Array.from(Keypair.generate().secretKey)), "utf8");
    const stubPath = join(here, "../../scripts/zerion-cli-devnet-stub.mjs");
    const snap = await buildZerionReadinessSnapshot(
      {
        ZERION_API_KEY: "k",
        ZERION_CLI_PATH: stubPath,
        ZERION_AGENT_WALLET_ADDRESS: "W",
        SOLANA_RPC_URL: "https://rpc.example",
        SOLANA_KEYPAIR_PATH: kpPath,
        ANCHOR_MODE: "mock",
        APROOF_ENV: "solana-devnet",
      },
      { cwd: iso },
    );
    expect(snap.zerion_cli_is_stub_path).toBe(true);
  });

  it("separates execution_ready, anchor_ready, anchor_balance_ready, and integration_ready", async () => {
    const iso = emptyCwd();
    const kpPath = join(iso, "kp.json");
    writeFileSync(kpPath, JSON.stringify(Array.from(Keypair.generate().secretKey)), "utf8");
    const snap = await buildZerionReadinessSnapshot(
      {
        ZERION_API_KEY: "",
        ZERION_CLI_PATH: "",
        ZERION_AGENT_WALLET_ADDRESS: "",
        SOLANA_RPC_URL: "https://rpc.example",
        SOLANA_KEYPAIR_PATH: kpPath,
        ANCHOR_MODE: "mock",
        APROOF_ENV: "solana-devnet",
      },
      { cwd: iso },
    );
    expect(snap.execution_ready).toBe(false);
    expect(snap.anchor_ready).toBe(true);
    expect(snap.anchor_balance_ready).toBe(true);
    expect(snap.integration_ready).toBe(false);
    expect(snap.missing).toContain("ZERION_API_KEY");
  });

  it("reports anchor_balance_ready false when devnet anchor mode cannot parse keypair", async () => {
    const iso = emptyCwd();
    const kpPath = join(iso, "bad.json");
    writeFileSync(kpPath, "[1,2,3]", "utf8");
    const snap = await buildZerionReadinessSnapshot(
      {
        ZERION_API_KEY: "k",
        ZERION_CLI_PATH: join(here, "zerion-readiness.ts"),
        ZERION_AGENT_WALLET_ADDRESS: "W",
        SOLANA_RPC_URL: "https://rpc.example",
        SOLANA_KEYPAIR_PATH: kpPath,
        ANCHOR_MODE: "solana-devnet",
        APROOF_ENV: "solana-devnet",
      },
      { cwd: iso },
    );
    expect(snap.anchor_ready).toBe(true);
    expect(snap.anchor_balance_ready).toBe(false);
    expect(snap.integration_ready).toBe(false);
  });

  it("derives execution wallet and default CLI from .local keypair and bundled script under cwd", async () => {
    const root = join(tmpdir(), `zderive-${randomUUID()}`);
    mkdirSync(join(root, ".local"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    const kp = Keypair.generate();
    writeFileSync(join(root, ".local/zerion-agent-keypair.json"), JSON.stringify(Array.from(kp.secretKey)), "utf8");
    writeFileSync(
      join(root, "scripts", "aproof-agent-devnet-execute.mjs"),
      readFileSync(join(here, "../../scripts/aproof-agent-devnet-execute.mjs"), "utf8"),
      "utf8",
    );
    const ak = Keypair.generate();
    const anchorKpPath = join(root, "anchor.json");
    writeFileSync(anchorKpPath, JSON.stringify(Array.from(ak.secretKey)), "utf8");

    const snap = await buildZerionReadinessSnapshot(
      {
        ZERION_API_KEY: "k",
        SOLANA_RPC_URL: "https://127.0.0.1:9/nope",
        SOLANA_KEYPAIR_PATH: anchorKpPath,
        ANCHOR_MODE: "mock",
        APROOF_ENV: "solana-devnet",
      },
      { cwd: root },
    );
    expect(snap.zerion_wallet_address_present).toBe(true);
    expect(snap.agent_wallet_public_address).toBe(kp.publicKey.toBase58());
    expect(snap.zerion_agent_keypair_present).toBe(true);
    expect(snap.zerion_cli_path_present).toBe(true);
    expect(snap.zerion_cli_path_exists).toBe(true);
    expect(snap.zerion_cli_path_env_explicit).toBe(false);
    expect(snap.zerion_agent_wallet_env_explicit).toBe(false);
    expect(snap.local_devnet_executor_notice).toContain("local AProof devnet executor");
    expect(snap.execution_ready).toBe(true);
    expect(snap.local_devnet_executor_path_active).toBe(true);
    expect(snap.execution_readiness_blocker).toBeNull();
    expect(snap.anchor_readiness_blocker).toBeNull();
    expect(snap.readiness_detail.zerion_agent_wallet).toBe("derived");
  });

  it("flags execution_wallet_balance_unavailable when RPC balance read throws", async () => {
    const iso = emptyCwd();
    writeFileSync(join(iso, "cli.mjs"), "export {}\n", "utf8");
    writeFileSync(join(iso, "kp.json"), JSON.stringify(Array.from(Keypair.generate().secretKey)), "utf8");
    const snap2 = await buildZerionReadinessSnapshot(
      {
        ZERION_API_KEY: "k",
        SOLANA_RPC_URL: "https://127.0.0.1:9/nope",
        ZERION_AGENT_WALLET_ADDRESS: "DTKoNv4V7GhSk9S68ucswYYBwomtv8zZDNmD56pELs1Q",
        ZERION_CLI_PATH: join(iso, "cli.mjs"),
        SOLANA_KEYPAIR_PATH: join(iso, "kp.json"),
        ANCHOR_MODE: "solana-devnet",
        APROOF_ENV: "solana-devnet",
      },
      { cwd: iso },
    );
    expect(snap2.execution_wallet_balance_unavailable).toBe(true);
    expect(snap2.missing).toContain("SOLANA_RPC_BALANCE_READ_FAILED");
  });
});

/**
 * Zerion + Solana devnet anchor readiness (presence / safe balance — never secrets).
 */
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { resolveAproofPackageRoot } from "../config/aproof-package-root.js";
import { resolveAnchorMode } from "../anchor/solana-devnet-anchor.js";
import { isLocalZerionCliStubPath } from "./zerion-execution-adapter.js";
import {
  effectiveZerionAgentKeypairPath,
  effectiveZerionAgentWallet,
  effectiveZerionCliPath,
  isBundledAproofDevnetExecutorPath,
  resolveLocalZerionAgentKeypairAbs,
} from "./zerion-local-defaults.js";

function readMaxSpendUsd(env: NodeJS.ProcessEnv): number {
  const raw = env.ZERION_MAX_SPEND_USD;
  const n = raw != null && raw.trim() !== "" ? Number(raw) : 5;
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

function readApprovedAssets(env: NodeJS.ProcessEnv): string[] {
  const raw = env.ZERION_APPROVED_ASSETS ?? "SOL,USDC";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function readAllowedChain(env: NodeJS.ProcessEnv): string {
  return (env.ZERION_ALLOWED_CHAIN ?? "solana-devnet").trim() || "solana-devnet";
}

function readMinBalanceLamports(env: NodeJS.ProcessEnv): number {
  const n = Number(env.SOLANA_MIN_BALANCE_LAMPORTS?.trim() || "10000000");
  return Number.isFinite(n) && n > 0 ? n : 10_000_000;
}

function safeStatIsFile(absPath: string): boolean {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

function anchorEnvGateOpen(env: NodeJS.ProcessEnv): boolean {
  const anchorMode = env.ANCHOR_MODE?.trim().toLowerCase() === "solana-devnet";
  const aproofEnv = (env.APROOF_ENV ?? "").trim().toLowerCase() === "solana-devnet";
  return anchorMode || aproofEnv;
}

export type ZerionReadinessSnapshot = {
  ok: true;
  sandbox: true;
  zerion_api_key_present: boolean;
  zerion_cli_path_present: boolean;
  zerion_cli_path_exists: boolean;
  zerion_cli_path_is_file: boolean;
  zerion_wallet_address_present: boolean;
  solana_rpc_url_present: boolean;
  solana_keypair_path_present: boolean;
  solana_keypair_path_exists: boolean;
  solana_keypair_path_is_file: boolean;
  solana_anchor_mode_devnet: boolean;
  anchor_balance_ready: boolean;
  solana_balance_lamports: number | null;
  solana_balance_sol: number | null;
  wallet_public_address: string | null;
  agent_execution_wallet_balance_lamports: number | null;
  agent_execution_wallet_balance_sol: number | null;
  allowed_chain: string;
  max_spend_usd: number;
  approved_assets: string[];
  aproof_subject_id: string;
  aproof_env: string;
  /** Public Solana address configured for Zerion Agent CLI execution (never a secret). */
  agent_wallet_public_address: string | null;
  /** True when `ZERION_CLI_PATH` resolves to the repo dev stub script, not a forked Zerion binary. */
  zerion_cli_is_stub_path: boolean;
  execution_ready: boolean;
  anchor_ready: boolean;
  integration_ready: boolean;
  missing: string[];
  set_execution_wallet_help: string | null;
  fund_execution_wallet_help: string | null;
  what_is_working: string[];
  what_is_next: string[];
  /** True when `ZERION_AGENT_KEYPAIR_PATH` is set (never exposes file contents). */
  zerion_agent_keypair_present: boolean;
  zerion_agent_keypair_exists: boolean;
  zerion_agent_keypair_is_file: boolean;
  /** Execution wallet balance on devnet (same numeric source as agent_execution_wallet_balance_sol). */
  zerion_agent_balance_sol: number | null;
  /** When local signing file for the devnet executor is unset but recommended. */
  zerion_agent_keypair_help: string | null;
  /** Shown when the bundled `aproof-agent-devnet-execute.mjs` is used without an explicit `ZERION_CLI_PATH`. */
  local_devnet_executor_notice: string | null;
  /** True when live integration is ready and the CLI is not the local dev stub. */
  live_solana_devnet_execution_enabled: boolean;
  /** True when the effective CLI path is the repo’s `aproof-agent-devnet-execute.mjs`. */
  local_devnet_executor_path_active: boolean;
  /** True when `ZERION_CLI_PATH` is set in the environment (not defaulted from the repo). */
  zerion_cli_path_env_explicit: boolean;
  /** True when `ZERION_AGENT_WALLET_ADDRESS` is set (pubkey was not only derived from `.local/`). */
  zerion_agent_wallet_env_explicit: boolean;
  /** True when RPC was configured but the execution wallet balance could not be read (network/rate limit). */
  execution_wallet_balance_unavailable: boolean;
  /** True when anchor prerequisites passed but anchor balance could not be read from RPC. */
  anchor_wallet_balance_unavailable: boolean;
  /** One-line reason execution_ready is false (never contains secrets). */
  execution_readiness_blocker: string | null;
  /** One-line reason anchor_ready is false. */
  anchor_readiness_blocker: string | null;
  /** One-line reason integration_ready is false when execution/anchor gates pass. */
  integration_readiness_blocker: string | null;
  /** Compact checklist for the Zerion Agent panel (no secret values). */
  readiness_detail: {
    zerion_api_key: "present" | "missing";
    solana_rpc_url: "present" | "missing";
    zerion_cli: "found" | "missing";
    zerion_agent_wallet: "present" | "derived" | "missing";
    zerion_agent_keypair_file: "found" | "missing";
    anchor_devnet_gate: "active" | "inactive";
    solana_anchor_keypair_file: "found" | "missing";
  };
};

function resolveKeypairAbsolute(
  env: NodeJS.ProcessEnv,
  cwd: string = process.cwd(),
): { present: boolean; abs: string; exists: boolean; isFile: boolean } {
  const raw = env.SOLANA_KEYPAIR_PATH?.trim() ?? "";
  if (!raw) return { present: false, abs: "", exists: false, isFile: false };
  const abs = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
  const exists = existsSync(abs);
  const isFile = exists && safeStatIsFile(abs);
  return { present: true, abs, exists, isFile };
}

function resolveZerionAgentKeypairAbsolute(env: NodeJS.ProcessEnv, cwd: string = process.cwd()): {
  present: boolean;
  abs: string;
  exists: boolean;
  isFile: boolean;
} {
  const raw = env.ZERION_AGENT_KEYPAIR_PATH?.trim() ?? "";
  if (!raw) return { present: false, abs: "", exists: false, isFile: false };
  const abs = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
  const exists = existsSync(abs);
  const isFile = exists && safeStatIsFile(abs);
  return { present: true, abs, exists, isFile };
}

function resolveZerionExecutionKeypairState(
  env: NodeJS.ProcessEnv,
  cwd: string,
): { present: boolean; abs: string; exists: boolean; isFile: boolean } {
  const fromEnv = resolveZerionAgentKeypairAbsolute(env, cwd);
  if (fromEnv.present) return fromEnv;
  const abs = resolveLocalZerionAgentKeypairAbs(cwd);
  const ok = existsSync(abs) && safeStatIsFile(abs);
  return { present: ok, abs, exists: ok, isFile: ok };
}

/**
 * Presence-only snapshot plus optional devnet balance read for the anchor keypair (never logs secrets).
 */
export async function buildZerionReadinessSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { cwd?: string },
): Promise<ZerionReadinessSnapshot> {
  const cwd = opts?.cwd ?? resolveAproofPackageRoot();
  const apiKey = Boolean(env.ZERION_API_KEY?.trim());
  const cliEnvExplicit = Boolean(env.ZERION_CLI_PATH?.trim());
  const walletEnvExplicit = Boolean(env.ZERION_AGENT_WALLET_ADDRESS?.trim());
  const cliPathEff = effectiveZerionCliPath(env, cwd);
  const cliPresent = cliPathEff.length > 0;
  const cliExists = cliPresent && existsSync(cliPathEff);
  const cliIsFile = cliExists && safeStatIsFile(cliPathEff);
  const agentWalletPub = effectiveZerionAgentWallet(env, cwd);
  const zerionWallet = Boolean(agentWalletPub);
  const rpc = Boolean(env.SOLANA_RPC_URL?.trim());
  const anchorModeDevnet = anchorEnvGateOpen(env);
  const kp = resolveKeypairAbsolute(env, cwd);
  const zKp = resolveZerionExecutionKeypairState(env, cwd);
  const execKeypairAbs = effectiveZerionAgentKeypairPath(env, cwd);
  const needsExecKeypair = cliIsFile && isBundledAproofDevnetExecutorPath(cliPathEff);
  const execKeypairOk = !needsExecKeypair || execKeypairAbs.length > 0;

  const missing: string[] = [];
  if (!apiKey) missing.push("ZERION_API_KEY");
  if (!cliPresent || !cliExists || !cliIsFile) missing.push("ZERION_CLI_PATH");
  if (!zerionWallet) missing.push("ZERION_AGENT_WALLET_ADDRESS");
  if (!rpc) missing.push("SOLANA_RPC_URL");
  if (!kp.present || !kp.exists || !kp.isFile) missing.push("SOLANA_KEYPAIR_PATH");
  if (!anchorModeDevnet) missing.push("ANCHOR_MODE=solana-devnet");
  if (needsExecKeypair && !execKeypairAbs) missing.push("ZERION_AGENT_KEYPAIR_PATH");

  const execution_ready = apiKey && cliPresent && cliExists && cliIsFile && zerionWallet && rpc && execKeypairOk;
  const anchor_ready = rpc && kp.present && kp.exists && kp.isFile && anchorModeDevnet;

  const minLamports = readMinBalanceLamports(env);
  let solana_balance_lamports: number | null = null;
  let solana_balance_sol: number | null = null;
  let wallet_public_address: string | null = null;
  let anchor_balance_ready = false;

  const anchorModeResolved = resolveAnchorMode(env);
  const needsLiveBalance = anchor_ready && anchorModeResolved === "solana-devnet";
  let anchorBalanceRpcError = false;

  if (needsLiveBalance) {
    try {
      const raw = await readFile(kp.abs, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length !== 64 || parsed.some((n) => !Number.isInteger(n))) {
        anchor_balance_ready = false;
      } else {
        const keypair = Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
        wallet_public_address = keypair.publicKey.toBase58();
        const rpcUrl = env.SOLANA_RPC_URL!.trim();
        try {
          const connection = new Connection(rpcUrl, "confirmed");
          const bal = await connection.getBalance(keypair.publicKey, "confirmed");
          solana_balance_lamports = bal;
          solana_balance_sol = bal / 1e9;
          anchor_balance_ready = bal >= minLamports;
        } catch {
          anchorBalanceRpcError = true;
          solana_balance_lamports = null;
          solana_balance_sol = null;
          anchor_balance_ready = false;
        }
      }
    } catch {
      solana_balance_lamports = null;
      solana_balance_sol = null;
      anchor_balance_ready = false;
    }
  } else if (anchor_ready) {
    /** Mock/sandbox/disabled anchor — no lamports spend; treat balance gate satisfied when anchor files/env are OK. */
    anchor_balance_ready = true;
    try {
      const raw = await readFile(kp.abs, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length === 64 && parsed.every((n) => Number.isInteger(n))) {
        const keypair = Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
        wallet_public_address = keypair.publicKey.toBase58();
      }
    } catch {
      wallet_public_address = null;
    }
  }

  const execAddrRaw = agentWalletPub;
  let agent_execution_wallet_balance_lamports: number | null = null;
  let agent_execution_wallet_balance_sol: number | null = null;
  let execBalanceRpcError = false;
  if (rpc && execAddrRaw.length > 0) {
    try {
      const pk = new PublicKey(execAddrRaw);
      const rpcUrl = env.SOLANA_RPC_URL!.trim();
      const connection = new Connection(rpcUrl, "confirmed");
      const b = await connection.getBalance(pk, "confirmed");
      agent_execution_wallet_balance_lamports = b;
      agent_execution_wallet_balance_sol = b / 1e9;
    } catch {
      execBalanceRpcError = true;
      agent_execution_wallet_balance_lamports = null;
      agent_execution_wallet_balance_sol = null;
    }
  }

  if (execBalanceRpcError && rpc && zerionWallet && !missing.includes("SOLANA_RPC_BALANCE_READ_FAILED")) {
    missing.push("SOLANA_RPC_BALANCE_READ_FAILED");
  }
  if (anchorBalanceRpcError && rpc && anchor_ready && !missing.includes("SOLANA_RPC_BALANCE_READ_FAILED")) {
    missing.push("SOLANA_RPC_BALANCE_READ_FAILED");
  }

  const integration_ready = execution_ready && anchor_ready && anchor_balance_ready;
  const agentWalletAddr = execAddrRaw;
  const stubPath = cliIsFile ? isLocalZerionCliStubPath(cliPathEff) : false;
  const local_devnet_executor_path_active = cliIsFile && isBundledAproofDevnetExecutorPath(cliPathEff);
  const local_devnet_executor_notice =
    local_devnet_executor_path_active && !cliEnvExplicit
      ? "Using local AProof devnet executor until a full forked zerion-ai execution path is configured."
      : null;
  const live_solana_devnet_execution_enabled = integration_ready && !stubPath;

  const MIN_AGENT_EXEC_LAMPORTS = 150_000;
  const set_execution_wallet_help = zerionWallet
    ? null
    : "Generate or configure a Solana devnet execution wallet for the Zerion Agent (or run npm run zerion:wallet:generate).";
  let fund_execution_wallet_help: string | null = null;
  if (zerionWallet && execBalanceRpcError) {
    fund_execution_wallet_help =
      "Execution wallet balance unavailable — check SOLANA_RPC_URL or RPC rate limits.";
  } else if (
    zerionWallet &&
    agent_execution_wallet_balance_lamports !== null &&
    agent_execution_wallet_balance_lamports < MIN_AGENT_EXEC_LAMPORTS
  ) {
    fund_execution_wallet_help = `Fund this Zerion Agent execution wallet with devnet SOL: ${execAddrRaw}`;
  }
  const zerion_agent_keypair_help =
    needsExecKeypair && !execKeypairAbs
      ? "Set ZERION_AGENT_KEYPAIR_PATH or create .local/zerion-agent-keypair.json (npm run zerion:wallet:generate)."
      : null;

  const what_is_working = [
    "AProof scoped policy evaluation on each Zerion Agent execution intent",
    "Seven-angle deterministic proofs and Failure Locator",
    "Execution continuity (event_lineage_id and event_version)",
  ];
  if (anchor_ready) {
    what_is_working.push("Solana devnet anchoring path (anchor keypair + RPC + devnet mode)");
  }
  if (local_devnet_executor_notice) {
    what_is_working.push(local_devnet_executor_notice);
  }

  const what_is_next: string[] = [];
  if (!integration_ready) {
    if (!apiKey) what_is_next.push("Configure ZERION_API_KEY for the execution CLI (do not log or commit it).");
    if (!cliPresent || !cliExists || !cliIsFile) {
      const def = path.resolve(cwd, "scripts", "aproof-agent-devnet-execute.mjs");
      what_is_next.push(
        existsSync(def) && safeStatIsFile(def)
          ? `Point ZERION_CLI_PATH at your executor, or rely on the default: ${def}`
          : "Point ZERION_CLI_PATH at scripts/aproof-agent-devnet-execute.mjs (this repo) or at zerion-ai/scripts/aproof-agent-execute.mjs in your fork.",
      );
    } else if (!cliEnvExplicit && local_devnet_executor_path_active) {
      what_is_next.push(`Optional: set ZERION_CLI_PATH=${cliPathEff} explicitly in .env (defaults already resolve this path).`);
    }
    if (!zerionWallet && set_execution_wallet_help) what_is_next.push(set_execution_wallet_help);
    if (!rpc) what_is_next.push("Set SOLANA_RPC_URL for Solana devnet.");
    if (!kp.present || !kp.exists || !kp.isFile) what_is_next.push("Set SOLANA_KEYPAIR_PATH for AProof anchoring (gitignored keypair JSON).");
    if (!anchorModeDevnet) what_is_next.push("Set ANCHOR_MODE=solana-devnet and APROOF_ENV=solana-devnet for proof anchoring.");
    if (anchor_ready && !anchor_balance_ready) {
      if (anchorBalanceRpcError) {
        what_is_next.push(
          "Anchor wallet balance unavailable — check SOLANA_RPC_URL or RPC rate limits, then rerun readiness. If the faucet fails, fund the anchor public address manually with devnet SOL.",
        );
      } else {
        what_is_next.push("Raise anchor wallet lamports above SOLANA_MIN_BALANCE_LAMPORTS (npm run devnet:wallet:bootstrap).");
      }
    }
    if (fund_execution_wallet_help) what_is_next.push(fund_execution_wallet_help);
    if (zerion_agent_keypair_help) what_is_next.push(zerion_agent_keypair_help);
    if (!walletEnvExplicit && zerionWallet && existsSync(resolveLocalZerionAgentKeypairAbs(cwd))) {
      what_is_next.push(
        `Optional: set ZERION_AGENT_WALLET_ADDRESS=${agentWalletPub} and ZERION_AGENT_KEYPAIR_PATH=${resolveLocalZerionAgentKeypairAbs(cwd)} in .env (pubkey is already derived from the local keypair file).`,
      );
    }
  }
  if (stubPath) {
    what_is_next.push(
      "Replace zerion-cli-devnet-stub with aproof-agent-devnet-execute.mjs or your fork for real Solana devnet tx_hash values.",
    );
  }
  if (execBalanceRpcError && rpc && zerionWallet) {
    what_is_next.push(
      "Execution wallet balance could not be read from RPC — verify SOLANA_RPC_URL and that the endpoint is reachable (public devnet RPCs may rate-limit).",
    );
  }

  const execution_wallet_balance_unavailable = Boolean(zerionWallet && rpc && execBalanceRpcError);
  const anchor_wallet_balance_unavailable = Boolean(anchor_ready && needsLiveBalance && anchorBalanceRpcError);

  let execution_readiness_blocker: string | null = null;
  if (!execution_ready) {
    if (!apiKey) {
      execution_readiness_blocker =
        "Execution is blocked because ZERION_API_KEY is not set in the environment loaded by the API process (ensure APROOF/.env is loaded — set APROOF_DEBUG_ENV_KEYS=1 on startup to print presence-only diagnostics).";
    } else if (!rpc) {
      execution_readiness_blocker =
        "Execution is blocked because SOLANA_RPC_URL is not set in the environment loaded by the API process.";
    } else if (!cliPresent || !cliExists || !cliIsFile) {
      execution_readiness_blocker = `Execution is blocked because no Zerion CLI entry file was found (set ZERION_CLI_PATH or place scripts/aproof-agent-devnet-execute.mjs under ${cwd}).`;
    } else if (!zerionWallet) {
      execution_readiness_blocker =
        "Execution is blocked because no execution wallet public key was configured or derived (set ZERION_AGENT_WALLET_ADDRESS or create .local/zerion-agent-keypair.json).";
    } else if (needsExecKeypair && !execKeypairAbs) {
      execution_readiness_blocker =
        "Execution is blocked because the devnet executor requires ZERION_AGENT_KEYPAIR_PATH or .local/zerion-agent-keypair.json.";
    }
  }

  let anchor_readiness_blocker: string | null = null;
  if (!anchor_ready) {
    if (!rpc) {
      anchor_readiness_blocker =
        "Anchor readiness is blocked because SOLANA_RPC_URL is not set in the environment loaded by the API process.";
    } else if (!kp.present || !kp.exists || !kp.isFile) {
      anchor_readiness_blocker =
        "Anchor readiness is blocked because SOLANA_KEYPAIR_PATH is missing or the file does not exist (run npm run devnet:wallet:bootstrap or set SOLANA_KEYPAIR_PATH to a gitignored keypair JSON).";
    } else if (!anchorModeDevnet) {
      anchor_readiness_blocker =
        "Anchor readiness is blocked because ANCHOR_MODE/APROOF_ENV do not enable solana-devnet anchoring (set ANCHOR_MODE=solana-devnet and/or APROOF_ENV=solana-devnet).";
    }
  }

  let integration_readiness_blocker: string | null = null;
  if (!integration_ready) {
    if (!execution_ready && execution_readiness_blocker) {
      integration_readiness_blocker = `Integration blocked: ${execution_readiness_blocker}`;
    } else if (!anchor_ready && anchor_readiness_blocker) {
      integration_readiness_blocker = `Integration blocked: ${anchor_readiness_blocker}`;
    } else if (execution_ready && anchor_ready && !anchor_balance_ready) {
      integration_readiness_blocker = anchorBalanceRpcError
        ? "Integration blocked: anchor wallet balance could not be read from RPC — check SOLANA_RPC_URL or rate limits."
        : `Integration blocked: anchor wallet is below SOLANA_MIN_BALANCE_LAMPORTS (${minLamports} lamports). Run npm run devnet:wallet:bootstrap or fund the anchor pubkey manually.`;
    } else {
      integration_readiness_blocker = "Integration blocked: see execution/anchor readiness and missing[] above.";
    }
  }

  const readiness_detail = {
    zerion_api_key: apiKey ? ("present" as const) : ("missing" as const),
    solana_rpc_url: rpc ? ("present" as const) : ("missing" as const),
    zerion_cli: cliIsFile ? ("found" as const) : ("missing" as const),
    zerion_agent_wallet: !zerionWallet ? ("missing" as const) : walletEnvExplicit ? ("present" as const) : ("derived" as const),
    zerion_agent_keypair_file: zKp.isFile ? ("found" as const) : ("missing" as const),
    anchor_devnet_gate: anchorModeDevnet ? ("active" as const) : ("inactive" as const),
    solana_anchor_keypair_file: kp.isFile ? ("found" as const) : ("missing" as const),
  };

  return {
    ok: true,
    sandbox: true,
    zerion_api_key_present: apiKey,
    zerion_cli_path_present: cliPresent,
    zerion_cli_path_exists: cliExists,
    zerion_cli_path_is_file: cliIsFile,
    zerion_wallet_address_present: zerionWallet,
    solana_rpc_url_present: rpc,
    solana_keypair_path_present: kp.present,
    solana_keypair_path_exists: kp.exists,
    solana_keypair_path_is_file: kp.isFile,
    solana_anchor_mode_devnet: anchorModeDevnet,
    anchor_balance_ready,
    solana_balance_lamports,
    solana_balance_sol,
    wallet_public_address,
    agent_execution_wallet_balance_lamports,
    agent_execution_wallet_balance_sol,
    allowed_chain: readAllowedChain(env),
    max_spend_usd: readMaxSpendUsd(env),
    approved_assets: readApprovedAssets(env),
    aproof_subject_id: (env.APROOF_SUBJECT_ID ?? "zerion-agent").trim() || "zerion-agent",
    aproof_env: (env.APROOF_ENV ?? "solana-devnet").trim() || "solana-devnet",
    agent_wallet_public_address: agentWalletAddr.length > 0 ? agentWalletAddr : null,
    zerion_cli_is_stub_path: stubPath,
    execution_ready,
    anchor_ready,
    integration_ready,
    missing,
    set_execution_wallet_help,
    fund_execution_wallet_help,
    what_is_working,
    what_is_next,
    zerion_agent_keypair_present: zKp.present,
    zerion_agent_keypair_exists: zKp.present && zKp.exists,
    zerion_agent_keypair_is_file: zKp.present && zKp.isFile,
    zerion_agent_balance_sol: agent_execution_wallet_balance_sol,
    zerion_agent_keypair_help,
    local_devnet_executor_notice,
    live_solana_devnet_execution_enabled,
    local_devnet_executor_path_active,
    zerion_cli_path_env_explicit: cliEnvExplicit,
    zerion_agent_wallet_env_explicit: walletEnvExplicit,
    execution_wallet_balance_unavailable,
    anchor_wallet_balance_unavailable,
    execution_readiness_blocker,
    anchor_readiness_blocker,
    integration_readiness_blocker,
    readiness_detail,
  };
}

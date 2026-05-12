/**
 * Forked Zerion CLI execution adapter (sandbox / devnet).
 *
 * Local hardwire: point `ZERION_CLI_PATH` at a Node entry in your fork of zerion-ai (see
 * `docs/hardwire-local-zerion-agent.md`). AProof spawns:
 *
 *   node <ZERION_CLI_PATH> --chain <chain> --asset <asset> --amount-usd <n> \
 *     --wallet <ZERION_AGENT_WALLET_ADDRESS> --recipient <recipient_address> --mode execute --json
 *
 * with `ZERION_API_KEY` present only in the child process env (never logged or echoed).
 * Parses the first JSON line of stdout; accepts tx fields `tx_hash` | `txHash` | `signature` |
 * `transactionSignature` | `transaction_hash`. Never fabricates signatures.
 *
 * Fails closed when env, process, or output is invalid.
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolveAproofPackageRoot } from "../config/aproof-package-root.js";
import {
  effectiveZerionAgentKeypairPath,
  effectiveZerionAgentWallet,
  effectiveZerionCliPath,
} from "./zerion-local-defaults.js";

const MAX_OUT_BYTES = 64_000;
const DEFAULT_TIMEOUT_MS = 60_000;

export const ZERION_ADAPTER_RUNTIME_ERROR = {
  INTEGRATION_NOT_READY: "ZERION_INTEGRATION_NOT_READY",
  CLI_PATH_INVALID: "ZERION_CLI_PATH_INVALID",
  CLI_EXECUTION_FAILED: "ZERION_CLI_EXECUTION_FAILED",
  TX_HASH_MISSING: "ZERION_TX_HASH_MISSING",
  CLI_TIMEOUT: "ZERION_CLI_TIMEOUT",
  CLI_INVALID_OUTPUT: "ZERION_CLI_INVALID_OUTPUT",
  POLICY_BLOCKED: "ZERION_POLICY_BLOCKED",
} as const;

/** True when `ZERION_CLI_PATH` is the repo’s local dev stub (not a forked Zerion binary). */
export function isLocalZerionCliStubPath(cliPath: string): boolean {
  return cliPath.replace(/\\/g, "/").toLowerCase().includes("zerion-cli-devnet-stub");
}

export type ZerionCliExecutionParams = {
  amount_usd: number;
  asset: string;
  chain: string;
  recipient_address?: string;
  /** For APROOF_DEBUG_ZERION_RECIPIENT=1 only; never logged otherwise. */
  scenario?: string;
};

export type ZerionCliExecutionSource = "zerion_cli" | "zerion_cli_stub";

export type ZerionCliExecutionOk = {
  ok: true;
  tx_hash: string;
  recipient_address: string | null;
  execution_source: ZerionCliExecutionSource;
  cli_invoked: true;
  execution_attempted: true;
  /** True only for the local `zerion-cli-devnet-stub.mjs` stand-in (not a forked Zerion binary). */
  execution_simulated: boolean;
  exit_code: 0;
  stdout_tail: string;
  stderr_tail: string;
};

export type ZerionCliExecutionErr = {
  ok: false;
  runtime_error: string;
  cli_invoked: boolean;
  execution_attempted: boolean;
  execution_source: ZerionCliExecutionSource | "none";
  exit_code: number | null;
  stdout_tail: string;
  stderr_excerpt: string;
};

export type ZerionCliExecutionResult = ZerionCliExecutionOk | ZerionCliExecutionErr;

function tail(s: string, max = 4000): string {
  if (s.length <= max) return s;
  return s.slice(-max);
}

function firstStructuredLine(stdout: string): string {
  const t = stdout.trim();
  if (!t) return "";
  const line = t.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  return line.trim();
}

function pickTxHashFromJson(j: Record<string, unknown>): string | null {
  const candidates = [
    j.tx_hash,
    j.txHash,
    j.signature,
    j.transactionSignature,
    j.transaction_hash,
    typeof j.result === "object" && j.result !== null && typeof (j.result as { tx_hash?: string }).tx_hash === "string"
      ? (j.result as { tx_hash: string }).tx_hash
      : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string") {
      const x = c.trim();
      if (x.length >= 32) return x;
    }
  }
  return null;
}

function pickRecipientFromJson(j: Record<string, unknown>): string | null {
  const candidates = [
    j.recipient_address,
    j.recipientAddress,
    j.destination_address,
    j.destinationAddress,
    typeof j.result === "object" && j.result !== null && typeof (j.result as { recipient_address?: string }).recipient_address === "string"
      ? (j.result as { recipient_address: string }).recipient_address
      : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string") {
      const x = c.trim();
      if (x.length >= 32) return x;
    }
  }
  return null;
}

function parseZerionCliJsonLine(stdout: string): {
  explicit_ok_false: boolean;
  runtime_error: string | null;
  /** Short safe reason from executor JSON `message` when `ok === false` (never a secret). */
  cli_message: string | null;
  hash: string | null;
  recipient: string | null;
  invalidStructuredOutput: boolean;
} {
  const line = firstStructuredLine(stdout);
  if (!line || !line.startsWith("{")) {
    return {
      explicit_ok_false: false,
      runtime_error: null,
      cli_message: null,
      hash: null,
      recipient: null,
      invalidStructuredOutput: false,
    };
  }
  try {
    const j = JSON.parse(line) as Record<string, unknown>;
    if (j.ok === false) {
      const re = typeof j.runtime_error === "string" ? j.runtime_error.trim() : "";
      const cm = typeof j.message === "string" ? j.message.trim() : "";
      return {
        explicit_ok_false: true,
        runtime_error: re.length > 0 ? re : ZERION_ADAPTER_RUNTIME_ERROR.CLI_EXECUTION_FAILED,
        cli_message: cm.length > 0 ? cm : null,
        hash: null,
        recipient: null,
        invalidStructuredOutput: false,
      };
    }
    if (j.ok === true) {
      const h = pickTxHashFromJson(j);
      const recipient = pickRecipientFromJson(j);
      return {
        explicit_ok_false: false,
        runtime_error: null,
        cli_message: null,
        hash: h,
        recipient,
        invalidStructuredOutput: !h,
      };
    }
    const h = pickTxHashFromJson(j);
    const recipient = pickRecipientFromJson(j);
    return {
      explicit_ok_false: false,
      runtime_error: null,
      cli_message: null,
      hash: h,
      recipient,
      invalidStructuredOutput: false,
    };
  } catch {
    return {
      explicit_ok_false: false,
      runtime_error: null,
      cli_message: null,
      hash: null,
      recipient: null,
      invalidStructuredOutput: true,
    };
  }
}

function debugRecipientAdapter(params: ZerionCliExecutionParams): void {
  if (process.env.APROOF_DEBUG_ZERION_RECIPIENT === "1") {
    const sid = params.scenario ?? "unknown";
    const rcpt = params.recipient_address?.trim() || "null";
    const has = Boolean(params.recipient_address?.trim());
    process.stderr.write(
      `[zerion-recipient] scenario=${sid} recipient_address=${rcpt} argv_has_recipient=${has}\n`,
    );
  }
}

function parseTxHashFromStdout(stdout: string): { hash: string | null; invalidStructuredOutput: boolean } {
  const line = firstStructuredLine(stdout);
  if (!line) return { hash: null, invalidStructuredOutput: false };

  if (line.startsWith("{")) {
    try {
      const j = JSON.parse(line) as Record<string, unknown>;
      const h = pickTxHashFromJson(j);
      if (h) return { hash: h, invalidStructuredOutput: false };
      return { hash: null, invalidStructuredOutput: true };
    } catch {
      return { hash: null, invalidStructuredOutput: true };
    }
  }

  const m = line.match(/"(?:tx_hash|txHash|signature|transactionSignature|transaction_hash)"\s*:\s*"([^"]+)"/);
  if (m?.[1]) {
    const x = m[1]!.trim();
    if (x.length >= 32) return { hash: x, invalidStructuredOutput: false };
  }
  const bare = line.match(/\b([1-9A-HJ-NP-Za-km-z]{64,88})\b/);
  if (bare?.[1]) {
    const x = bare[1]!.trim();
    if (x.length >= 32) return { hash: x, invalidStructuredOutput: false };
  }

  return { hash: null, invalidStructuredOutput: false };
}

function resolveExecutableAndArgs(cliPath: string): { executable: string; args: string[] } {
  const p = cliPath.trim();
  if (/\.(mjs|cjs|js)$/i.test(p)) {
    return { executable: process.execPath, args: [p] };
  }
  return { executable: p, args: [] };
}

function cliPathRunnableFile(cliPath: string): boolean {
  if (!cliPath || !existsSync(cliPath)) return false;
  try {
    return statSync(cliPath).isFile();
  } catch {
    return false;
  }
}

function fail(
  r: Omit<ZerionCliExecutionErr, "ok">,
): ZerionCliExecutionErr {
  return { ok: false, ...r };
}

/**
 * Invokes the configured Zerion CLI. Auth via env (e.g. ZERION_API_KEY) forwarded to child only — never logged.
 * Contract for forked scripts: see `docs/hardwire-local-zerion-agent.md`.
 */
export function runZerionCliExecution(
  params: ZerionCliExecutionParams,
  env: NodeJS.ProcessEnv = process.env,
  opts?: { cwd?: string },
): Promise<ZerionCliExecutionResult> {
  const cwd = opts?.cwd ?? resolveAproofPackageRoot();
  return new Promise((resolve) => {
    const cliPath = effectiveZerionCliPath(env, cwd);
    const wallet = effectiveZerionAgentWallet(env, cwd);
    const keypairPathEff = effectiveZerionAgentKeypairPath(env, cwd);

    if (!env.ZERION_API_KEY?.trim() || !wallet || !env.SOLANA_RPC_URL?.trim()) {
      resolve(
        fail({
          runtime_error: ZERION_ADAPTER_RUNTIME_ERROR.INTEGRATION_NOT_READY,
          cli_invoked: false,
          execution_attempted: false,
          execution_source: "none",
          exit_code: null,
          stdout_tail: "",
          stderr_excerpt: "",
        }),
      );
      return;
    }

    if (!cliPath.trim()) {
      resolve(
        fail({
          runtime_error: ZERION_ADAPTER_RUNTIME_ERROR.INTEGRATION_NOT_READY,
          cli_invoked: false,
          execution_attempted: false,
          execution_source: "none",
          exit_code: null,
          stdout_tail: "",
          stderr_excerpt: "",
        }),
      );
      return;
    }

    if (!existsSync(cliPath) || !cliPathRunnableFile(cliPath)) {
      resolve(
        fail({
          runtime_error: ZERION_ADAPTER_RUNTIME_ERROR.CLI_PATH_INVALID,
          cli_invoked: false,
          execution_attempted: false,
          execution_source: "none",
          exit_code: null,
          stdout_tail: "",
          stderr_excerpt: "",
        }),
      );
      return;
    }

    const stubCli = isLocalZerionCliStubPath(cliPath);
    const attemptSource: ZerionCliExecutionSource = stubCli ? "zerion_cli_stub" : "zerion_cli";

    const { executable, args: prefix } = resolveExecutableAndArgs(cliPath);
    const args = [
      ...prefix,
      "--chain",
      params.chain,
      "--asset",
      params.asset,
      "--amount-usd",
      String(params.amount_usd),
      "--wallet",
      wallet,
      ...(params.recipient_address ? ["--recipient", params.recipient_address] : []),
      "--mode",
      "execute",
      "--json",
    ];
    debugRecipientAdapter(params);

    const childEnv: NodeJS.ProcessEnv = { ...env };
    childEnv.ZERION_AGENT_WALLET_ADDRESS = wallet;
    if (keypairPathEff) childEnv.ZERION_AGENT_KEYPAIR_PATH = keypairPathEff;
    if (!env.ZERION_CLI_PATH?.trim() && cliPath.trim()) childEnv.ZERION_CLI_PATH = cliPath;

    const child = spawn(executable, args, {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const cap = (chunk: string, buf: { s: string }) => {
      buf.s += chunk;
      if (buf.s.length > MAX_OUT_BYTES) buf.s = buf.s.slice(-MAX_OUT_BYTES);
    };
    const outBuf = { s: "" };
    const errBuf = { s: "" };

    child.stdout?.on("data", (d: Buffer) => cap(d.toString("utf8"), outBuf));
    child.stderr?.on("data", (d: Buffer) => cap(d.toString("utf8"), errBuf));

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }, DEFAULT_TIMEOUT_MS);

    let settled = false;
    const finish = (r: ZerionCliExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(r);
    };

    child.on("error", () => {
      finish(
        fail({
          runtime_error: ZERION_ADAPTER_RUNTIME_ERROR.CLI_EXECUTION_FAILED,
          cli_invoked: true,
          execution_attempted: true,
          execution_source: attemptSource,
          exit_code: null,
          stdout_tail: tail(outBuf.s),
          stderr_excerpt: tail(errBuf.s),
        }),
      );
    });

    child.on("close", (code, signal) => {
      const stdout = outBuf.s;
      const stderr = errBuf.s;
      const exit_code = code ?? -1;

      if (timedOut) {
        finish(
          fail({
            runtime_error: ZERION_ADAPTER_RUNTIME_ERROR.CLI_TIMEOUT,
            cli_invoked: true,
            execution_attempted: true,
            execution_source: attemptSource,
            exit_code: exit_code === -1 ? null : exit_code,
            stdout_tail: tail(stdout),
            stderr_excerpt: tail(stderr),
          }),
        );
        return;
      }

      if (signal === "SIGTERM" && exit_code !== 0) {
        finish(
          fail({
            runtime_error: ZERION_ADAPTER_RUNTIME_ERROR.CLI_TIMEOUT,
            cli_invoked: true,
            execution_attempted: true,
            execution_source: attemptSource,
            exit_code,
            stdout_tail: tail(stdout),
            stderr_excerpt: tail(stderr),
          }),
        );
        return;
      }

      const parsed = parseZerionCliJsonLine(stdout);
      if (parsed.explicit_ok_false && parsed.runtime_error) {
        const mergedStderr = [parsed.cli_message, stderr].filter((x) => x && String(x).trim()).join("\n");
        finish(
          fail({
            runtime_error: parsed.runtime_error,
            cli_invoked: true,
            execution_attempted: true,
            execution_source: attemptSource,
            exit_code: exit_code === -1 ? null : exit_code,
            stdout_tail: tail(stdout),
            stderr_excerpt: tail(mergedStderr.length > 0 ? mergedStderr : stderr),
          }),
        );
        return;
      }

      if (exit_code !== 0) {
        finish(
          fail({
            runtime_error: ZERION_ADAPTER_RUNTIME_ERROR.CLI_EXECUTION_FAILED,
            cli_invoked: true,
            execution_attempted: true,
            execution_source: attemptSource,
            exit_code,
            stdout_tail: tail(stdout),
            stderr_excerpt: tail(stderr),
          }),
        );
        return;
      }

      const hash = parsed.hash ?? parseTxHashFromStdout(stdout).hash;
      const returnedRecipient = parsed.recipient;
      const invalidStructuredOutput = parsed.invalidStructuredOutput;
      if (!hash) {
        finish(
          fail({
            runtime_error: invalidStructuredOutput
              ? ZERION_ADAPTER_RUNTIME_ERROR.CLI_INVALID_OUTPUT
              : ZERION_ADAPTER_RUNTIME_ERROR.TX_HASH_MISSING,
            cli_invoked: true,
            execution_attempted: true,
            execution_source: attemptSource,
            exit_code,
            stdout_tail: tail(stdout),
            stderr_excerpt: tail(stderr),
          }),
        );
        return;
      }

      if (params.recipient_address && returnedRecipient && returnedRecipient !== params.recipient_address) {
        finish(
          fail({
            runtime_error: ZERION_ADAPTER_RUNTIME_ERROR.CLI_EXECUTION_FAILED,
            cli_invoked: true,
            execution_attempted: true,
            execution_source: attemptSource,
            exit_code,
            stdout_tail: tail(stdout),
            stderr_excerpt: tail(`recipient mismatch: expected ${params.recipient_address}, got ${returnedRecipient}`),
          }),
        );
        return;
      }

      finish({
        ok: true,
        tx_hash: hash,
        recipient_address: returnedRecipient ?? params.recipient_address ?? null,
        execution_source: attemptSource,
        cli_invoked: true,
        execution_attempted: true,
        execution_simulated: stubCli,
        exit_code: 0,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
      });
    });
  });
}

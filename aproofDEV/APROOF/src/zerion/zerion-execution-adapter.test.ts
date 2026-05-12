import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAproofPackageRoot } from "../config/aproof-package-root.js";
import { runZerionCliExecution, ZERION_ADAPTER_RUNTIME_ERROR } from "./zerion-execution-adapter.js";

const ENV_KEYS = [
  "ZERION_API_KEY",
  "ZERION_CLI_PATH",
  "ZERION_AGENT_WALLET_ADDRESS",
  "SOLANA_RPC_URL",
] as const;

function saveEnv(): Record<string, string | undefined> {
  const o: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) o[k] = process.env[k];
  return o;
}

function restoreEnv(saved: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("zerion-execution-adapter", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv();
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it("parses ok:false JSON on stdout before treating non-zero exit as generic failure", async () => {
    const dir = join(tmpdir(), `zerion-cli-fail-json-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    const scriptPath = join(dir, "cli-fail-json.mjs");
    writeFileSync(
      scriptPath,
      `import process from "node:process";
process.stdout.write(
  JSON.stringify({
    ok: false,
    runtime_error: "ZERION_CLI_SIM_FAIL",
    message: "insufficient funds for rent",
  }) + "\\n",
);
process.stderr.write("stderr diag\\n");
process.exit(1);
`,
      "utf8",
    );

    process.env.ZERION_API_KEY = "test_zerion_key_not_real";
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
    process.env.ZERION_AGENT_WALLET_ADDRESS = "DevnetWalletStub11111111111111111111111111";
    process.env.ZERION_CLI_PATH = scriptPath;

    const r = await runZerionCliExecution(
      { chain: "solana-devnet", asset: "SOL", amount_usd: 1 },
      process.env,
      { cwd: resolveAproofPackageRoot() },
    );

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure branch");
    expect(r.runtime_error).toBe("ZERION_CLI_SIM_FAIL");
    expect(r.exit_code).toBe(1);
    expect(r.stderr_excerpt).toContain("insufficient funds for rent");
    expect(r.stderr_excerpt).toContain("stderr diag");
    expect(r.stdout_tail).toContain("ZERION_CLI_SIM_FAIL");
    expect(JSON.stringify(r)).not.toMatch(/test_zerion_key_not_real/);
  });

  it("non-zero exit without ok:false JSON line yields CLI_EXECUTION_FAILED", async () => {
    const dir = join(tmpdir(), `zerion-cli-fail-plain-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    const scriptPath = join(dir, "cli-fail-plain.mjs");
    writeFileSync(
      scriptPath,
      `import process from "node:process";
process.stdout.write("not json\\n");
process.exit(2);
`,
      "utf8",
    );

    process.env.ZERION_API_KEY = "k";
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
    process.env.ZERION_AGENT_WALLET_ADDRESS = "DevnetWalletStub11111111111111111111111111";
    process.env.ZERION_CLI_PATH = scriptPath;

    const r = await runZerionCliExecution(
      { chain: "solana-devnet", asset: "SOL", amount_usd: 1 },
      process.env,
      { cwd: resolveAproofPackageRoot() },
    );

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure branch");
    expect(r.runtime_error).toBe(ZERION_ADAPTER_RUNTIME_ERROR.CLI_EXECUTION_FAILED);
    expect(r.exit_code).toBe(2);
  });

  it("stub CLI success returns tx_hash from first JSON line", async () => {
    const root = resolveAproofPackageRoot();
    process.env.ZERION_API_KEY = "k";
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
    process.env.ZERION_AGENT_WALLET_ADDRESS = "DevnetWalletStub11111111111111111111111111";
    process.env.ZERION_CLI_PATH = join(root, "scripts", "zerion-cli-devnet-stub.mjs");

    const r = await runZerionCliExecution(
      { chain: "solana-devnet", asset: "SOL", amount_usd: 1 },
      process.env,
      { cwd: root },
    );

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.tx_hash.length).toBeGreaterThanOrEqual(32);
    expect(r.execution_source).toBe("zerion_cli_stub");
  });

  it("passes continuity recipient through argv and returns it", async () => {
    const dir = join(tmpdir(), `zerion-cli-recipient-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    const scriptPath = join(dir, "cli-recipient.mjs");
    writeFileSync(
      scriptPath,
      `const argv = process.argv.slice(2);
function argAfter(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}
process.stdout.write(JSON.stringify({
  ok: true,
  tx_hash: "RecipientContinuityTx".padEnd(88, "X"),
  recipient_address: argAfter("--recipient"),
}) + "\\n");
`,
      "utf8",
    );

    const recipient = "11111111111111111111111111111111";
    process.env.ZERION_API_KEY = "k";
    process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
    process.env.ZERION_AGENT_WALLET_ADDRESS = "DevnetWalletStub11111111111111111111111111";
    process.env.ZERION_CLI_PATH = scriptPath;

    const r = await runZerionCliExecution(
      { chain: "solana-devnet", asset: "SOL", amount_usd: 1, recipient_address: recipient },
      process.env,
      { cwd: resolveAproofPackageRoot() },
    );

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.recipient_address).toBe(recipient);
  });
});

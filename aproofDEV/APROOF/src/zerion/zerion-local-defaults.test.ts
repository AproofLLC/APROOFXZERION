import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  effectiveZerionAgentKeypairPath,
  effectiveZerionAgentWallet,
  effectiveZerionCliPath,
  readPubkeyFromZerionKeypairFile,
  resolveLocalZerionAgentKeypairAbs,
} from "./zerion-local-defaults.js";

describe("zerion-local-defaults", () => {
  it("derives pubkey from a local keypair file without exposing secret bytes in return value", () => {
    const dir = join(tmpdir(), `zloc-${randomUUID()}`);
    mkdirSync(join(dir, ".local"), { recursive: true });
    const kp = Keypair.generate();
    const abs = join(dir, ".local/zerion-agent-keypair.json");
    writeFileSync(abs, JSON.stringify(Array.from(kp.secretKey)), "utf8");
    const pub = readPubkeyFromZerionKeypairFile(abs);
    expect(pub).toBe(kp.publicKey.toBase58());
    expect(effectiveZerionAgentWallet({}, dir)).toBe(kp.publicKey.toBase58());
    expect(effectiveZerionAgentKeypairPath({}, dir)).toBe(abs);
  });

  it("resolves default devnet executor path when present under cwd", () => {
    const dir = join(tmpdir(), `zcli-${randomUUID()}`);
    mkdirSync(join(dir, "scripts"), { recursive: true });
    const p = join(dir, "scripts", "aproof-agent-devnet-execute.mjs");
    writeFileSync(p, "// stub\n", "utf8");
    expect(effectiveZerionCliPath({}, dir)).toBe(p);
  });

  it("prefers env ZERION_CLI_PATH over default script", () => {
    const dir = join(tmpdir(), `zcli2-${randomUUID()}`);
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "aproof-agent-devnet-execute.mjs"), "x", "utf8");
    const other = join(dir, "other.mjs");
    writeFileSync(other, "y", "utf8");
    expect(effectiveZerionCliPath({ ZERION_CLI_PATH: other }, dir)).toBe(other);
  });

  it("exposes stable local keypair absolute path helper", () => {
    const dir = join(tmpdir(), `zabs-${randomUUID()}`);
    const abs = resolveLocalZerionAgentKeypairAbs(dir);
    expect(abs.endsWith(".local/zerion-agent-keypair.json") || abs.endsWith(".local\\zerion-agent-keypair.json")).toBe(
      true,
    );
  });
});

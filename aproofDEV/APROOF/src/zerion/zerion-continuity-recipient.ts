import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";

export const LOCAL_ZERION_CONTINUITY_RECIPIENT_REL = ".local/zerion-continuity-recipient.json";
export const LOCAL_ZERION_AUTHORIZED_RECIPIENT_REL = ".local/zerion-authorized-recipient-address.txt";
export const ZERION_CONTINUITY_RECIPIENT_ENV = "ZERION_CONTINUITY_RECIPIENT_ADDRESS";
export const ZERION_AUTHORIZED_RECIPIENT_ENV = "ZERION_AUTHORIZED_RECIPIENT_ADDRESS";

export type ZerionContinuityRecipientResolution = {
  recipient_address: string;
  source: "env" | "persisted" | "generated";
  path: string | null;
};

export type AuthorizedExecutionRecipientResolution = {
  recipient_address: string;
  source: "env" | "persisted" | "generated";
  path: string | null;
};

function isValidSolanaPublicKey(v: string): boolean {
  try {
    new PublicKey(v);
    return true;
  } catch {
    return false;
  }
}

function readAuthorizedRecipientTxt(absPath: string): string | null {
  try {
    const raw = readFileSync(absPath, "utf8");
    const line =
      raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith("#")) ?? "";
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}

function resolveAuthorizedRecipientFilePath(cwd: string): string {
  return path.resolve(cwd, LOCAL_ZERION_AUTHORIZED_RECIPIENT_REL);
}

/**
 * Recipient used only for Authorized Execution (separate file and env from continuity).
 * If `ZERION_AUTHORIZED_RECIPIENT_ADDRESS` is unset, generates once and persists under
 * `.local/zerion-authorized-recipient-address.txt` (never reuses continuity state).
 */
export function resolveAuthorizedExecutionRecipientAddress(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): AuthorizedExecutionRecipientResolution {
  const envRecipient = env[ZERION_AUTHORIZED_RECIPIENT_ENV]?.trim();
  if (envRecipient) {
    if (!isValidSolanaPublicKey(envRecipient)) {
      throw new Error(`${ZERION_AUTHORIZED_RECIPIENT_ENV} must be a valid Solana public key`);
    }
    return { recipient_address: envRecipient, source: "env", path: null };
  }

  const filePath = resolveAuthorizedRecipientFilePath(cwd);
  const persisted = readAuthorizedRecipientTxt(filePath);
  if (persisted) {
    if (!isValidSolanaPublicKey(persisted)) {
      throw new Error(`Persisted authorized execution recipient is not a valid Solana public key: ${filePath}`);
    }
    return { recipient_address: persisted, source: "persisted", path: filePath };
  }

  const generated = Keypair.generate().publicKey.toBase58();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${generated}\n`, "utf8");
  return { recipient_address: generated, source: "generated", path: filePath };
}

function readPersistedRecipient(absPath: string): string | null {
  try {
    const raw = JSON.parse(readFileSync(absPath, "utf8")) as unknown;
    if (typeof raw === "string") return raw.trim() || null;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const v = (raw as Record<string, unknown>).recipient_address;
      return typeof v === "string" && v.trim() ? v.trim() : null;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveRecipientFilePath(env: NodeJS.ProcessEnv, cwd: string): string {
  const explicit = env.ZERION_CONTINUITY_RECIPIENT_PATH?.trim();
  if (explicit) return path.isAbsolute(explicit) ? explicit : path.resolve(cwd, explicit);
  return path.resolve(cwd, LOCAL_ZERION_CONTINUITY_RECIPIENT_REL);
}

export function resolveZerionContinuityRecipient(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): ZerionContinuityRecipientResolution {
  const envRecipient = env[ZERION_CONTINUITY_RECIPIENT_ENV]?.trim();
  if (envRecipient) {
    if (!isValidSolanaPublicKey(envRecipient)) {
      throw new Error(`${ZERION_CONTINUITY_RECIPIENT_ENV} must be a valid Solana public key`);
    }
    return { recipient_address: envRecipient, source: "env", path: null };
  }

  const filePath = resolveRecipientFilePath(env, cwd);
  const persisted = readPersistedRecipient(filePath);
  if (persisted) {
    if (!isValidSolanaPublicKey(persisted)) {
      throw new Error(`Persisted Zerion continuity recipient is not a valid Solana public key: ${filePath}`);
    }
    return { recipient_address: persisted, source: "persisted", path: filePath };
  }

  const generated = Keypair.generate().publicKey.toBase58();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify({ recipient_address: generated, created_at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  return { recipient_address: generated, source: "generated", path: filePath };
}

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { apiKeys } from "../db/schema/index.js";

const SCRYPT_KEY_LEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

/* ------------------------------------------------------------------ */
/* Public helpers for key storage                                     */
/* ------------------------------------------------------------------ */

export function hashApiKeyForStorage(secret: string): {
  keyHash: string;
  hashAlgo: "scrypt";
  keySalt: string;
  keyPrefix: string;
} {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(secret, salt, SCRYPT_KEY_LEN, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  });
  return {
    keyHash: derived.toString("hex"),
    hashAlgo: "scrypt",
    keySalt: salt,
    keyPrefix: secret.slice(0, 8),
  };
}

/** Legacy sha256 for backward-compat seeding/testing only. */
export function legacySha256Hash(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* Verification                                                       */
/* ------------------------------------------------------------------ */

function verifyScrypt(secret: string, storedHash: string, salt: string): boolean {
  const derived = scryptSync(secret, salt, SCRYPT_KEY_LEN, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  });
  const storedBuf = Buffer.from(storedHash, "hex");
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
}

function verifySha256(secret: string, storedHash: string): boolean {
  const computed = createHash("sha256").update(secret, "utf8").digest("hex");
  const computedBuf = Buffer.from(computed, "hex");
  const storedBuf = Buffer.from(storedHash, "hex");
  if (computedBuf.length !== storedBuf.length) return false;
  return timingSafeEqual(computedBuf, storedBuf);
}

export function verifyApiKeySecret(
  secret: string,
  row: { keyHash: string; hashAlgo: string; keySalt: string | null },
): boolean {
  if (row.hashAlgo === "scrypt" && row.keySalt) {
    return verifyScrypt(secret, row.keyHash, row.keySalt);
  }
  return verifySha256(secret, row.keyHash);
}

/* ------------------------------------------------------------------ */
/* Resolution: prefix-first lookup + algo-aware verification          */
/* ------------------------------------------------------------------ */

export async function resolveApiKey(db: Db, secret: string | undefined) {
  if (!secret?.trim()) return null;

  const prefix = secret.slice(0, 8);

  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyPrefix, prefix), isNull(apiKeys.revokedAt)))
    .limit(10);

  if (rows.length === 0) return null;

  for (const row of rows) {
    if (verifyApiKeySecret(secret, row)) {
      return row;
    }
  }

  return null;
}

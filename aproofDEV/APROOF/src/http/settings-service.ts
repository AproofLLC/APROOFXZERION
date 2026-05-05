/**
 * Settings/control-plane service: API keys, account, organization, environment.
 */
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "../db/client.js";
import {
  apiKeys,
  environments,
  organizations,
  users,
} from "../db/schema/index.js";
import { hashApiKeyForStorage } from "./auth-api-key.js";

const SCRYPT_KEY_LEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export type ApiKeyInfo = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  revoked: boolean;
};

export type ApiSettingsResponse = {
  keys: ApiKeyInfo[];
};

export async function getApiSettings(
  db: Db,
  params: { organizationId: string; environmentId: string }
): Promise<ApiSettingsResponse> {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.organizationId, params.organizationId),
        eq(apiKeys.environmentId, params.environmentId)
      )
    );

  return {
    keys: rows.map((r) => ({
      id: r.id,
      name: r.name,
      key_prefix: r.keyPrefix,
      created_at: r.createdAt.toISOString(),
      revoked: !!r.revokedAt,
    })),
  };
}

export type CreateApiKeyResult = {
  id: string;
  name: string;
  key_prefix: string;
  plain_key: string;
  created_at: string;
};

export async function createApiKey(
  db: Db,
  params: { organizationId: string; environmentId: string; name: string }
): Promise<CreateApiKeyResult> {
  const secret = `ak_${randomUUID().replace(/-/g, "")}`;
  const { keyHash, hashAlgo, keySalt, keyPrefix } = hashApiKeyForStorage(secret);
  const id = randomUUID();

  await db.insert(apiKeys).values({
    id,
    organizationId: params.organizationId,
    environmentId: params.environmentId,
    name: params.name || "Unnamed key",
    keyPrefix,
    keyHash,
    hashAlgo,
    keySalt,
  });

  return {
    id,
    name: params.name || "Unnamed key",
    key_prefix: keyPrefix,
    plain_key: secret,
    created_at: new Date().toISOString(),
  };
}

export async function revokeApiKey(
  db: Db,
  params: { keyId: string; organizationId: string; environmentId: string }
): Promise<boolean> {
  const [row] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, params.keyId),
        eq(apiKeys.organizationId, params.organizationId),
        eq(apiKeys.environmentId, params.environmentId),
        isNull(apiKeys.revokedAt)
      )
    )
    .limit(1);
  if (!row) return false;
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, row.id));
  return true;
}

export type AccountInfo = {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
};

export async function getAccount(
  db: Db,
  userId: string
): Promise<AccountInfo | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    user_id: row.id,
    email: row.email,
    role: row.role,
    created_at: row.createdAt.toISOString(),
  };
}

export async function updateAccountEmail(
  db: Db,
  params: { userId: string; email: string }
): Promise<boolean> {
  const email = params.email.trim().toLowerCase();
  if (!email) return false;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing && existing.id !== params.userId) return false;

  await db
    .update(users)
    .set({ email, updatedAt: new Date() })
    .where(eq(users.id, params.userId));
  return true;
}

export async function updateAccountPassword(
  db: Db,
  params: { userId: string; current_password: string; new_password: string }
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  if (!params.new_password || params.new_password.length < 6) {
    return { ok: false, code: "INVALID_INPUT", message: "New password must be at least 6 characters." };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);
  if (!user) return { ok: false, code: "NOT_FOUND", message: "User not found." };

  const [salt, hash] = user.passwordHash.split(":");
  if (!salt || !hash) return { ok: false, code: "INTERNAL_ERROR", message: "Corrupt password hash." };
  const derived = scryptSync(params.current_password, salt, SCRYPT_KEY_LEN, {
    cost: SCRYPT_COST, blockSize: SCRYPT_BLOCK_SIZE, parallelization: SCRYPT_PARALLELIZATION,
  });
  const storedBuf = Buffer.from(hash, "hex");
  if (derived.length !== storedBuf.length || !timingSafeEqual(derived, storedBuf)) {
    return { ok: false, code: "UNAUTHORIZED", message: "Current password is incorrect." };
  }

  const newSalt = randomBytes(16).toString("hex");
  const newDerived = scryptSync(params.new_password, newSalt, SCRYPT_KEY_LEN, {
    cost: SCRYPT_COST, blockSize: SCRYPT_BLOCK_SIZE, parallelization: SCRYPT_PARALLELIZATION,
  });
  const newHash = `${newSalt}:${newDerived.toString("hex")}`;

  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, params.userId));
  return { ok: true };
}

export type OrgInfo = {
  organization_id: string;
  name: string;
  created_at: string;
};

export async function getOrganization(
  db: Db,
  orgId: string
): Promise<OrgInfo | null> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) return null;
  return {
    organization_id: row.id,
    name: row.name,
    created_at: row.createdAt.toISOString(),
  };
}

export type OrgUserInfo = {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
};

export async function getOrganizationUsers(
  db: Db,
  orgId: string
): Promise<OrgUserInfo[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.organizationId, orgId));
  return rows
    .map((r) => ({
      user_id: r.id,
      email: r.email,
      role: r.role,
      created_at: r.createdAt.toISOString(),
    }))
    .sort((a, b) => a.user_id.localeCompare(b.user_id));
}

export type EnvInfo = {
  environment_id: string;
  name: string;
  mode: "testnet" | "staging" | "production";
  created_at: string;
};

export async function getEnvironment(
  db: Db,
  params: { environmentId: string; organizationId: string }
): Promise<EnvInfo | null> {
  const [row] = await db
    .select()
    .from(environments)
    .where(
      and(
        eq(environments.id, params.environmentId),
        eq(environments.organizationId, params.organizationId)
      )
    )
    .limit(1);
  if (!row) return null;

  return {
    environment_id: row.id,
    name: row.name,
    mode: row.mode as EnvInfo["mode"],
    created_at: row.createdAt.toISOString(),
  };
}

export async function updateEnvironmentName(
  db: Db,
  params: { environmentId: string; organizationId: string; name: string }
): Promise<boolean> {
  if (!params.name.trim()) return false;
  await db
    .update(environments)
    .set({ name: params.name.trim() })
    .where(
      and(
        eq(environments.id, params.environmentId),
        eq(environments.organizationId, params.organizationId)
      )
    );
  return true;
}

export async function updateEnvironmentMode(
  db: Db,
  params: { environmentId: string; organizationId: string; mode: "testnet" | "staging" | "production" }
): Promise<boolean> {
  await db
    .update(environments)
    .set({ mode: params.mode })
    .where(
      and(
        eq(environments.id, params.environmentId),
        eq(environments.organizationId, params.organizationId)
      )
    );
  return true;
}

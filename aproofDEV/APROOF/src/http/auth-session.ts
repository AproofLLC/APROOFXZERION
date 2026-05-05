/**
 * Auth/session service: sign-up, sign-in, sign-out, session resolution.
 * Uses scrypt for password hashing and SHA-256 for session token hashing.
 * Session tokens are returned as plain strings for the caller to set as cookies.
 */
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  environments,
  organizations,
  sessions,
  subjects,
  users,
} from "../db/schema/index.js";

const SCRYPT_KEY_LEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEY_LEN, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  });
  return `${salt}:${derived.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, SCRYPT_KEY_LEN, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  });
  const storedBuf = Buffer.from(hash, "hex");
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type SignUpInput = {
  email: string;
  password: string;
  organization_name: string;
};

export type SignUpResult =
  | { ok: true; user_id: string; organization_id: string; environment_id: string; session_token: string; expires_at: string }
  | { ok: false; code: string; message: string };

/**
 * Creates organization, default environment, user, and a new session row.
 * The plain session token is returned for the HTTP layer to set `aproof_session` only;
 * it is not part of the public JSON sign-up response.
 */
export async function signUp(db: Db, input: SignUpInput): Promise<SignUpResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password || input.password.length < 6) {
    return { ok: false, code: "INVALID_INPUT", message: "Email and password (min 6 chars) are required." };
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingUser) {
    return { ok: false, code: "CONFLICT", message: "Email already registered." };
  }

  const orgId = randomUUID();
  const envId = randomUUID();
  const userId = randomUUID();
  const passwordHash = hashPassword(input.password);

  await db.insert(organizations).values({ id: orgId, name: input.organization_name || `org-${orgId.slice(0, 8)}` });
  await db.insert(environments).values({
    id: envId,
    organizationId: orgId,
    name: "production",
    mode: "production",
  });
  await db.insert(users).values({ id: userId, organizationId: orgId, email, passwordHash });

  const token = randomUUID();
  const tHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    organizationId: orgId,
    environmentId: envId,
    tokenHash: tHash,
    expiresAt,
  });

  return { ok: true, user_id: userId, organization_id: orgId, environment_id: envId, session_token: token, expires_at: expiresAt.toISOString() };
}

export type SignInInput = { email: string; password: string };

export type SignInResult =
  | { ok: true; session_token: string; user_id: string; organization_id: string; environment_id: string; expires_at: string }
  | { ok: false; code: string; message: string };

export async function signIn(db: Db, input: SignInInput): Promise<SignInResult> {
  const email = input.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return { ok: false, code: "UNAUTHORIZED", message: "Invalid email or password." };
  }

  const [env] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(eq(environments.organizationId, user.organizationId))
    .limit(1);
  if (!env) {
    return { ok: false, code: "INTERNAL_ERROR", message: "No environment found for organization." };
  }

  const token = randomUUID();
  const tHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId: user.id,
    organizationId: user.organizationId,
    environmentId: env.id,
    tokenHash: tHash,
    expiresAt,
  });

  return {
    ok: true,
    session_token: token,
    user_id: user.id,
    organization_id: user.organizationId,
    environment_id: env.id,
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * Revokes all active sessions for the user except the one matching `keepSessionTokenPlain`.
 * Used after password change so other devices lose access while the current cookie stays valid.
 */
export async function revokeSessionsForUserExceptCurrent(
  db: Db,
  userId: string,
  keepSessionTokenPlain: string | undefined,
): Promise<void> {
  if (!keepSessionTokenPlain?.trim()) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    return;
  }
  const keepHash = hashToken(keepSessionTokenPlain);
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.tokenHash, keepHash)),
    );
}

export async function signOut(db: Db, sessionToken: string): Promise<boolean> {
  if (!sessionToken) return false;
  const tHash = hashToken(sessionToken);
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tHash), isNull(sessions.revokedAt)))
    .limit(1);
  if (!row) return false;
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, row.id));
  return true;
}

export type SessionContext = {
  user_id: string;
  organization_id: string;
  environment_id: string;
  environment: string;
  /** Control-plane mode for the active environment (from `environments.mode`). */
  environment_mode: "testnet" | "staging" | "production";
  has_subject: boolean;
  subject_id: string | null;
  /** ISO-8601 session expiry (deterministic for UI session chrome). */
  expires_at: string;
};

export async function resolveSession(db: Db, sessionToken: string | undefined): Promise<SessionContext | null> {
  if (!sessionToken?.trim()) return null;
  const tHash = hashToken(sessionToken);

  const [row] = await db
    .select({
      userId: sessions.userId,
      organizationId: sessions.organizationId,
      environmentId: sessions.environmentId,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tHash), isNull(sessions.revokedAt)))
    .limit(1);

  if (!row || row.expiresAt < new Date()) return null;

  const [env] = await db
    .select({ name: environments.name, mode: environments.mode })
    .from(environments)
    .where(eq(environments.id, row.environmentId))
    .limit(1);

  const [sub] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      and(
        eq(subjects.organizationId, row.organizationId),
        eq(subjects.environmentId, row.environmentId)
      )
    )
    .limit(1);

  return {
    user_id: row.userId,
    organization_id: row.organizationId,
    environment_id: row.environmentId,
    environment: env?.name ?? "unknown",
    environment_mode: env?.mode ?? "production",
    has_subject: !!sub,
    subject_id: sub?.id ?? null,
    expires_at: row.expiresAt.toISOString(),
  };
}

/**
 * Extracts session token from cookie header.
 * Looks for `aproof_session=<token>`.
 */
export function extractSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)aproof_session=([^;]+)/);
  return match?.[1] ?? undefined;
}

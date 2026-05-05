/**
 * E2E: Complete control-plane and read-model API surface tests.
 * Covers auth/session (A), subjects (B), overview (C), events (D),
 * lineages (E), failures (F), baselines (G), settings (H), sandbox (I).
 */
import { createHash, randomUUID } from "node:crypto";
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createDb, type Db } from "../src/db/client.js";
import { buildServer } from "../src/http/server.js";
import {
  apiKeys,
  baselines,
  environments,
  mappingRules,
  organizations,
  subjects,
} from "../src/db/schema/index.js";
import type { FastifyInstance } from "fastify";
import { SANDBOX_SESSION_SUCCESS_JSON_KEYS } from "../src/http/sandbox-session-response.js";
import { SUBJECT_CORE_JSON_KEYS } from "../src/http/subject-contract.js";

const e2eUrl = process.env.E2E_DATABASE_URL?.trim();

async function closeDb(db: Db) {
  if (db.$client instanceof Pool) {
    await db.$client.end();
  } else {
    await db.$client.close();
  }
}

describe("e2e: control-plane API surface", () => {
  let db: Db;
  let app: FastifyInstance;

  // Seeded API-key infrastructure for existing proof engine routes
  let orgId: string;
  let envId: string;
  let subjectId: string;
  let apiKeyPlain: string;

  // Session-based auth context (filled by sign-up/sign-in tests)
  let sessionCookie: string;
  let sessionUserId: string;
  let sessionOrgId: string;
  let sessionEnvId: string;
  let sessionSubjectId: string;

  beforeAll(async () => {
    if (e2eUrl) {
      db = createDb(e2eUrl);
    } else {
      const { openPgliteMemory } = await import("../src/db/pglite.js");
      const opened = await openPgliteMemory();
      db = opened.db;
    }
    app = buildServer(db);

    // Seed for legacy API-key routes
    orgId = randomUUID();
    envId = randomUUID();
    subjectId = randomUUID();
    apiKeyPlain = `e2e_${randomUUID()}`;
    const keyHash = createHash("sha256").update(apiKeyPlain, "utf8").digest("hex");
    const keyPrefix = apiKeyPlain.slice(0, 8);

    await db.insert(organizations).values({ id: orgId, name: `e2e-cp-${orgId.slice(0, 8)}` });
    await db.insert(environments).values({ id: envId, organizationId: orgId, name: "e2e-env" });
    await db.insert(subjects).values({
      id: subjectId,
      organizationId: orgId,
      environmentId: envId,
      railType: "service",
    });
    await db.insert(apiKeys).values({
      organizationId: orgId,
      environmentId: envId,
      name: "e2e-cp-key",
      keyPrefix,
      keyHash,
      hashAlgo: "sha256",
    });
    await db.insert(mappingRules).values({
      organizationId: orgId,
      environmentId: envId,
      sourceTypeKey: "e2e.cp_test",
      canonicalEventType: "action_completed",
      isActive: true,
    });
    for (const angle of [
      "deterministic_integrity",
      "model_identity_integrity",
      "retrieval_integrity",
      "policy_integrity",
      "operational_integrity",
      "identity_access_integrity",
      "cross_system_integrity",
    ] as const) {
      await db.insert(baselines).values({
        organizationId: orgId,
        environmentId: envId,
        subjectId,
        angle,
        version: 1,
        definition: {},
        effectiveFrom: new Date(),
      });
    }
  });

  afterAll(async () => {
    await app?.close();
    if (db) await closeDb(db);
  });

  /* ================================================================ */
  /* A. AUTH / SESSION                                                  */
  /* ================================================================ */

  describe("A: auth/session", () => {
    it("POST /auth/sign-up creates user + org + auto-session, no subject", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: {
          email: `test-${randomUUID().slice(0, 8)}@aproof.test`,
          password: "secure_password_123",
          organization_name: "Test Org",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      expect(body.user_id).toBeTruthy();
      expect(body.organization_id).toBeTruthy();
      expect(body.environment_id).toBeTruthy();
      expect(body.expires_at).toBeTruthy();
      sessionUserId = body.user_id;
      sessionOrgId = body.organization_id;
      sessionEnvId = body.environment_id;

      // Sign-up should set session cookie automatically
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeTruthy();
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookieStr).toContain("aproof_session=");
      expect(cookieStr).toContain("HttpOnly");
      sessionCookie = cookieStr!.split(";")[0];
    });

    it("POST /auth/sign-up rejects duplicate email", async () => {
      const email = `dup-${randomUUID().slice(0, 8)}@aproof.test`;
      await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: { email, password: "password123", organization_name: "Org" },
      });
      const res = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: { email, password: "password456", organization_name: "Org2" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("POST /auth/sign-in returns session cookie", async () => {
      const email = `signin-${randomUUID().slice(0, 8)}@aproof.test`;
      await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: { email, password: "password123", organization_name: "Sign In Org" },
      });
      const res = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: "password123" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      const setCookie = res.headers["set-cookie"];
      expect(setCookie).toBeTruthy();
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookieStr).toContain("aproof_session=");
      // Do NOT override sessionCookie here — sign-up already established it for the primary test user
    });

    it("POST /auth/sign-in rejects wrong password", async () => {
      const email = `wrong-${randomUUID().slice(0, 8)}@aproof.test`;
      await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: { email, password: "password123", organization_name: "Org" },
      });
      const res = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: "wrong_password" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("GET /auth/session reflects has_subject=false for fresh account", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/session",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.has_subject).toBe(false);
      expect(body.subject_id).toBeNull();
      expect(body.environment_mode).toBe("production");
    });

    it("sign-up alone: session works immediately and sign-out clears it (no sign-in)", async () => {
      const email = `signup-only-${randomUUID().slice(0, 8)}@aproof.test`;
      const signupRes = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: { email, password: "signuponly_12", organization_name: "Signup Only Org" },
      });
      expect(signupRes.statusCode).toBe(201);
      const cookieHeader = Array.isArray(signupRes.headers["set-cookie"])
        ? signupRes.headers["set-cookie"][0]
        : signupRes.headers["set-cookie"];
      const cookie = cookieHeader!.split(";")[0];
      const sess = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie } });
      expect(sess.statusCode).toBe(200);
      const sessBody = JSON.parse(sess.payload);
      expect(sessBody.user_id).toBeTruthy();
      expect(sessBody.organization_id).toBeTruthy();
      expect(sessBody.environment_id).toBeTruthy();

      await app.inject({ method: "POST", url: "/auth/sign-out", headers: { cookie } });
      const after = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie } });
      expect(after.statusCode).toBe(200);
      expect(JSON.parse(after.payload).authenticated).toBe(false);
    });

    it("POST /auth/sign-out invalidates session", async () => {
      const email = `signout-${randomUUID().slice(0, 8)}@aproof.test`;
      await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: { email, password: "password123", organization_name: "Org" },
      });
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: "password123" },
      });
      const cookie = (Array.isArray(loginRes.headers["set-cookie"])
        ? loginRes.headers["set-cookie"][0]
        : loginRes.headers["set-cookie"])!.split(";")[0];

      await app.inject({
        method: "POST",
        url: "/auth/sign-out",
        headers: { cookie },
      });
      const sessionRes = await app.inject({
        method: "GET",
        url: "/auth/session",
        headers: { cookie },
      });
      expect(sessionRes.statusCode).toBe(200);
      expect(JSON.parse(sessionRes.payload).authenticated).toBe(false);
    });
  });

  /* ================================================================ */
  /* B. SUBJECTS                                                       */
  /* ================================================================ */

  describe("B: subjects", () => {
    it("POST /subjects creates subject with 7 baselines", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/subjects",
        headers: { cookie: sessionCookie },
        payload: { subject_type: "service" },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.subject_id).toBeTruthy();
      expect(body.subject_type).toBe("service");
      sessionSubjectId = body.subject_id;

      // Verify 7 baselines created
      const blRes = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}/baselines`,
        headers: { cookie: sessionCookie },
      });
      expect(blRes.statusCode).toBe(200);
      const blBody = JSON.parse(blRes.payload);
      expect(blBody.baselines).toHaveLength(7);
    });

    it("POST /subjects rejects invalid subject_type", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/subjects",
        headers: { cookie: sessionCookie },
        payload: { subject_type: "llm" },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error?.code).toBe("INVALID_BODY");
    });

    it("GET /subjects lists subjects", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/subjects",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.page).toBeTruthy();
      const item = body.items.find((x: { subject_id: string }) => x.subject_id === sessionSubjectId);
      expect(item).toBeTruthy();
      for (const key of SUBJECT_CORE_JSON_KEYS) {
        expect(Object.prototype.hasOwnProperty.call(item, key)).toBe(true);
      }
    });

    it("GET /subjects/:id returns subject detail", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.subject_id).toBe(sessionSubjectId);
      expect(body.latest_event_timestamp).toBeNull();
    });

    it("GET /subjects/:id returns subject with environment field", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.environment).toBeTruthy();
      expect(body.environment_id).toBeTruthy();
    });

    it("PATCH /subjects/:id updates external_key", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/subjects/${sessionSubjectId}`,
        headers: { cookie: sessionCookie },
        payload: { external_key: "my-ext-key" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.subject_id).toBe(sessionSubjectId);
    });

    it("PATCH /subjects/:id rejects unknown fields with 400", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/subjects/${sessionSubjectId}`,
        headers: { cookie: sessionCookie },
        payload: { external_key: "ok-key", extra_field: "nope" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("PATCH /subjects/:id returns 404 for unknown subject", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/subjects/${randomUUID()}`,
        headers: { cookie: sessionCookie },
        payload: { external_key: "nope" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("GET /subjects/:id org scoping returns 404 for other org", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(404);
    });

    it("GET /subjects/:id/events org scoping returns 404 for other org", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/events`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(404);
    });

    it("GET /subjects/:id/overview org scoping returns 404 for other org", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/overview`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(404);
    });

    it("cookie-authenticated POST with Sec-Fetch-Site cross-site is rejected (CSRF)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/subjects",
        headers: {
          cookie: sessionCookie,
          "sec-fetch-site": "cross-site",
          "content-type": "application/json",
        },
        payload: { subject_type: "service" },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.error?.code).toBe("CSRF_BLOCKED");
    });

    it("GET /auth/session reflects has_subject=true after subject creation", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/session",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.has_subject).toBe(true);
      expect(body.subject_id).toBeTruthy();
      expect(body.environment_mode).toBe("production");
    });
  });

  /* ================================================================ */
  /* C. OVERVIEW                                                       */
  /* ================================================================ */

  describe("C: overview", () => {
    it("GET /subjects/:id/overview returns empty-state overview", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}/overview`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);

      expect(body.subject_header.subject_id).toBe(sessionSubjectId);
      expect(body.subject_header.organization_id).toBeTruthy();
      expect(body.subject_header.environment_id).toBeTruthy();
      expect(body.subject_header.environment).toBeTruthy();
      expect(body.subject_header.created_at).toBeTruthy();
      expect(body.subject_header.latest_event_timestamp).toBeNull();
      expect(body.subject_header.latest_proof_timestamp).toBeNull();
      expect(body.subject_header.latest_anchor_timestamp).toBeNull();
      expect(body.status_strip.total_events).toBe(0);
      expect(body.status_strip.total_proofs).toBe(0);
      expect(body.status_strip.active_failures).toBe(0);
      expect(body.status_strip.lineage_count).toBe(0);
      expect(body.status_strip.baseline_coverage).toBe(7);
      expect(body.latest_proof_snapshot.proof_id).toBeNull();
      expect(body.angles_summary).toHaveLength(7);
      for (const a of body.angles_summary) {
        expect(a.status).toBe("not_applicable");
        expect(a.reason_code).toBe("NO_SOURCES");
      }
      expect(body.recent_events).toEqual([]);
      expect(body.active_failures_list).toEqual([]);
      expect(body.pipeline_state.raw_ingested).toBe(false);
    });

    it("subject core block matches GET /subjects/:id vs overview subject_header", async () => {
      const getRes = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}`,
        headers: { cookie: sessionCookie },
      });
      expect(getRes.statusCode).toBe(200);
      const sub = JSON.parse(getRes.payload);
      const ovRes = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}/overview`,
        headers: { cookie: sessionCookie },
      });
      expect(ovRes.statusCode).toBe(200);
      const header = JSON.parse(ovRes.payload).subject_header;
      for (const key of SUBJECT_CORE_JSON_KEYS) {
        expect(header[key]).toEqual(sub[key]);
      }
    });
  });

  /* ================================================================ */
  /* D. EVENTS READ LAYER (via proof engine + session read)            */
  /* ================================================================ */

  describe("D: events read", () => {
    let eventId: string;
    let seededCookie: string;

    it("create session for seeded org to test read routes", async () => {
      // Create a user for the seeded org and sign in
      const { users } = await import("../src/db/schema/index.js");
      const email = `seeded-${randomUUID().slice(0, 8)}@aproof.test`;
      const { signUp } = await import("../src/http/auth-session.js");

      // Directly insert user for seeded org (signUp creates its own org)
      const { randomBytes, scryptSync } = await import("node:crypto");
      const salt = randomBytes(16).toString("hex");
      const derived = scryptSync(email, salt, 64, { cost: 16384, blockSize: 8, parallelization: 1 });
      const passwordHash = `${salt}:${derived.toString("hex")}`;
      const userId = randomUUID();
      await db.insert(users).values({
        id: userId,
        organizationId: orgId,
        email,
        passwordHash,
      });

      // Sign in
      const res = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: email },
      });
      expect(res.statusCode).toBe(200);
      const cookie = (Array.isArray(res.headers["set-cookie"])
        ? res.headers["set-cookie"][0]
        : res.headers["set-cookie"])!.split(";")[0];
      seededCookie = cookie;
    });

    it("events list is empty for session subject before ingestion", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}/events`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.items).toEqual([]);
      expect(body.page.total).toBe(0);
    });

    it("ingest event via API-key route for seeded subject with idempotency_key", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": apiKeyPlain },
        payload: {
          organization_id: orgId,
          environment_id: envId,
          source_type_key: "e2e.cp_test",
          subject_id: subjectId,
          trace_id: "trace-cp-1",
          occurred_at: new Date().toISOString(),
          payload: { record_id: "rec-1", status: "ok" },
          idempotency_key: "idem-key-001",
          ingestion_source: "e2e-test-harness",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      eventId = body.event_id;
    });

    it("GET /subjects/:id/events returns ingested event via seeded session", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/events`,
        headers: { cookie: seededCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      const item = body.items[0];
      expect(item.event_id).toBeTruthy();
      expect(item.artifact_id).toBeTruthy();
      expect(item.canonical_event_type).toBe("action_completed");
    });

    it("GET /events/:id returns event detail with all required sections", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/events/${eventId}`,
        headers: { cookie: seededCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.raw_payload).toBeDefined();
      expect(body.canonical_form).toBeDefined();
      expect(body.identity_resolution).toBeTruthy();
      expect(body.identity_resolution.artifact_id).toBeTruthy();
      expect(["EXACT_MATCH", "DERIVED", "AMBIGUOUS", "NEW"]).toContain(body.identity_resolution.identity_status);
      expect(body.identity_resolution.stable_identity_fields).toBeDefined();
      expect(body.lineage_assignment).toBeTruthy();
      expect(body.lineage_assignment.event_lineage_id).toBeTruthy();
      expect(body.lineage_assignment.version).toBeGreaterThanOrEqual(1);
      expect(body.state_hashes.canonical_hash).toBeTruthy();
      expect(body.linked_proof).toBeDefined();
      expect(body.pipeline_metadata).toBeTruthy();
      expect(body.pipeline_metadata.raw_ingested).toBe(true);
      expect(body.pipeline_metadata.canonicalized).toBe(true);
    });

    it("GET /subjects/:id/events returns idempotency_key and ingestion_source", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/events`,
        headers: { cookie: seededCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const item = body.items.find((e: any) => e.event_id === eventId);
      expect(item).toBeTruthy();
      expect(item.idempotency_key).toBe("idem-key-001");
      expect(item.ingestion_source).toBe("e2e-test-harness");
    });
  });

  /* ================================================================ */
  /* E. LINEAGES                                                       */
  /* ================================================================ */

  describe("E: lineages", () => {
    let seededCookie: string;

    it("setup seeded session for lineage tests", async () => {
      const { users: usersTable } = await import("../src/db/schema/index.js");
      const email = `lineage-${randomUUID().slice(0, 8)}@aproof.test`;
      const { randomBytes, scryptSync } = await import("node:crypto");
      const salt = randomBytes(16).toString("hex");
      const derived = scryptSync(email, salt, 64, { cost: 16384, blockSize: 8, parallelization: 1 });
      const passwordHash = `${salt}:${derived.toString("hex")}`;
      await db.insert(usersTable).values({
        id: randomUUID(),
        organizationId: orgId,
        email,
        passwordHash,
      });
      const res = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: email },
      });
      expect(res.statusCode).toBe(200);
      seededCookie = (Array.isArray(res.headers["set-cookie"])
        ? res.headers["set-cookie"][0]
        : res.headers["set-cookie"])!.split(";")[0];
    });

    it("GET /subjects/:id/lineages returns lineage list", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/lineages`,
        headers: { cookie: seededCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      const item = body.items[0];
      expect(item.lineage_id).toBeTruthy();
      expect(item.artifact_id).toBeTruthy();
      expect(item.version_count).toBeGreaterThanOrEqual(1);
    });

    it("GET /lineages/:id returns lineage detail with version timeline", async () => {
      const listRes = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/lineages`,
        headers: { cookie: seededCookie },
      });
      const items = JSON.parse(listRes.payload).items;
      expect(items.length).toBeGreaterThanOrEqual(1);
      const lineageId = items[0].lineage_id;

      const res = await app.inject({
        method: "GET",
        url: `/lineages/${lineageId}`,
        headers: { cookie: seededCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.artifact_identity.artifact_id).toBeTruthy();
      expect(body.version_timeline.length).toBeGreaterThanOrEqual(1);
      expect(body.delta_inspector).toBeDefined();
      expect(body.anchor_mapping).toBeDefined();
    });
  });

  /* ================================================================ */
  /* F. FAILURES                                                       */
  /* ================================================================ */

  describe("F: failures", () => {
    it("GET /failures remains stable with API-key auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/failures",
        headers: { "x-api-key": apiKeyPlain },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.items).toBeDefined();
      expect(body.page).toBeDefined();
    });

    it("GET /subjects/:id/failures returns failure list via session", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}/failures`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.items).toBeDefined();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.page).toBeDefined();
      expect(body.page.total).toBeGreaterThanOrEqual(0);
    });

    it("GET /failures/:id returns 404 for unknown id", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/failures/${randomUUID()}`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  /* ================================================================ */
  /* G. BASELINES                                                      */
  /* ================================================================ */

  describe("G: baselines", () => {
    it("GET /subjects/:id/baselines returns 7 angles", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}/baselines`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.baselines).toHaveLength(7);
      const angles = body.baselines.map((b: any) => b.angle);
      expect(angles).toContain("policy_integrity");
      expect(angles).toContain("deterministic_integrity");
      const policy = body.baselines.find((b: any) => b.angle === "policy_integrity");
      expect(policy).toBeTruthy();
      expect(typeof policy.enabled).toBe("boolean");
      expect(typeof policy.required).toBe("boolean");
      expect(["auto", "user"]).toContain(policy.default_origin);
    });

    it("PATCH /subjects/:id/baselines merges angle_control", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/subjects/${sessionSubjectId}/baselines`,
        headers: { cookie: sessionCookie, "content-type": "application/json" },
        payload: {
          angles: {
            retrieval_integrity: { enabled: true, required: false },
          },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const ri = body.baselines.find((b: any) => b.angle === "retrieval_integrity");
      expect(ri).toBeTruthy();
      expect(ri.enabled).toBe(true);
    });

    it("GET /subjects/:id/baselines/:angle returns detail", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${sessionSubjectId}/baselines/policy_integrity`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.angle).toBe("policy_integrity");
      expect(body.baseline_version).toBeGreaterThanOrEqual(1);
    });

    it("POST /subjects/:id/baselines/:angle/versions creates new version", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/subjects/${sessionSubjectId}/baselines/policy_integrity/versions`,
        headers: { cookie: sessionCookie },
        payload: { definition: { rules: [{ check: "policy_v2" }] } },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.baseline_version).toBe(2);
    });

    it("baseline version history is immutable (version increments)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/subjects/${sessionSubjectId}/baselines/policy_integrity/versions`,
        headers: { cookie: sessionCookie },
        payload: { definition: { rules: [{ check: "policy_v3" }] } },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.baseline_version).toBe(3);
    });
  });

  /* ================================================================ */
  /* H. SETTINGS                                                       */
  /* ================================================================ */

  describe("H: settings", () => {
    it("GET /settings/api returns API key info", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/settings/api",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.keys).toBeDefined();
    });

    it("POST /settings/api-keys creates key and returns plain key once", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/settings/api-keys",
        headers: { cookie: sessionCookie },
        payload: { name: "test-key" },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.plain_key).toBeTruthy();
      expect(body.id).toBeTruthy();

      // Verify key is visible in list
      const listRes = await app.inject({
        method: "GET",
        url: "/settings/api",
        headers: { cookie: sessionCookie },
      });
      const listBody = JSON.parse(listRes.payload);
      expect(listBody.keys.some((k: any) => k.id === body.id)).toBe(true);
    });

    it("DELETE /settings/api-keys/:id revokes key", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/settings/api-keys",
        headers: { cookie: sessionCookie },
        payload: { name: "to-revoke" },
      });
      const keyId = JSON.parse(createRes.payload).id;

      const res = await app.inject({
        method: "DELETE",
        url: `/settings/api-keys/${keyId}`,
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /settings/account returns account info", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/settings/account",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.user_id).toBeTruthy();
      expect(body.email).toBeTruthy();
    });

    it("PATCH /settings/account updates email", async () => {
      const newEmail = `updated-${randomUUID().slice(0, 8)}@aproof.test`;
      const res = await app.inject({
        method: "PATCH",
        url: "/settings/account",
        headers: { cookie: sessionCookie },
        payload: { email: newEmail },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.email).toBe(newEmail);
    });

    it("PATCH /settings/account updates password", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/settings/account",
        headers: { cookie: sessionCookie },
        payload: { current_password: "secure_password_123", new_password: "new_secure_456" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("PATCH /settings/account rejects wrong current password", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/settings/account",
        headers: { cookie: sessionCookie },
        payload: { current_password: "wrong_password", new_password: "new_pass_789" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("sign-in succeeds with password after PATCH /settings/account password change", async () => {
      const email = `pw-roll-${randomUUID().slice(0, 8)}@aproof.test`;
      const signup = await app.inject({
        method: "POST",
        url: "/auth/sign-up",
        payload: { email, password: "initial_pass_12", organization_name: "Pw Roll Org" },
      });
      expect(signup.statusCode).toBe(201);
      const cookie = (Array.isArray(signup.headers["set-cookie"])
        ? signup.headers["set-cookie"][0]
        : signup.headers["set-cookie"])!.split(";")[0];
      const patchRes = await app.inject({
        method: "PATCH",
        url: "/settings/account",
        headers: { cookie },
        payload: { current_password: "initial_pass_12", new_password: "rotated_pass_34" },
      });
      expect(patchRes.statusCode).toBe(200);
      const bad = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: "initial_pass_12" },
      });
      expect(bad.statusCode).toBe(401);
      const good = await app.inject({
        method: "POST",
        url: "/auth/sign-in",
        payload: { email, password: "rotated_pass_34" },
      });
      expect(good.statusCode).toBe(200);
      expect(JSON.parse(good.payload).ok).toBe(true);
    });

    it("GET /settings/organization returns org info", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/settings/organization",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.organization_id).toBeTruthy();
      expect(body.name).toBeTruthy();
    });

    it("GET /settings/organization/users returns users list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/settings/organization/users",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.users.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /settings/environment returns env info with mode", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/settings/environment",
        headers: { cookie: sessionCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.environment_id).toBeTruthy();
      expect(["testnet", "staging", "production"]).toContain(body.mode);
    });

    it("PATCH /settings/environment name-only leaves stored mode unchanged", async () => {
      const g1 = await app.inject({
        method: "GET",
        url: "/settings/environment",
        headers: { cookie: sessionCookie },
      });
      const modeBefore = JSON.parse(g1.payload).mode as string;
      const res = await app.inject({
        method: "PATCH",
        url: "/settings/environment",
        headers: { cookie: sessionCookie },
        payload: { name: `display-${randomUUID().slice(0, 8)}` },
      });
      expect(res.statusCode).toBe(200);
      const g2 = await app.inject({
        method: "GET",
        url: "/settings/environment",
        headers: { cookie: sessionCookie },
      });
      expect(JSON.parse(g2.payload).mode).toBe(modeBefore);
    });

    it("PATCH /settings/environment updates name", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/settings/environment",
        headers: { cookie: sessionCookie },
        payload: { name: "staging-env" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe("staging-env");
    });

    it("PATCH /settings/environment updates name and mode together", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/settings/environment",
        headers: { cookie: sessionCookie },
        payload: { name: "staging", mode: "staging" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe("staging");
      expect(body.mode).toBe("staging");
    });

    it("PATCH /settings/environment updates via mode enum", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/settings/environment",
        headers: { cookie: sessionCookie },
        payload: { mode: "testnet" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.mode).toBe("testnet");
    });

    it("PATCH /settings/environment rejects invalid mode", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/settings/environment",
        headers: { cookie: sessionCookie },
        payload: { mode: "invalid_mode" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  /* ================================================================ */
  /* I. SANDBOX / TESTNET                                              */
  /* ================================================================ */

  describe("I: sandbox", () => {
    it("POST /sandbox/session creates isolated sandbox with testnet env", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/sandbox/session",
        payload: { organization_name: "Sandbox Test" },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
      expect(body.sandbox).toBe(true);
      expect(body.environment_mode).toBe("testnet");
      expect(body.session_token).toBeUndefined();
      expect(Object.keys(body).sort()).toEqual([...SANDBOX_SESSION_SUCCESS_JSON_KEYS].sort());
      expect(body.expires_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
      const setCookie = Array.isArray(res.headers["set-cookie"])
        ? res.headers["set-cookie"][0]
        : res.headers["set-cookie"];
      expect(setCookie).toContain("aproof_session=");
    });

    it("POST /sandbox/session repeated calls create distinct organizations", async () => {
      const r1 = await app.inject({
        method: "POST",
        url: "/sandbox/session",
        payload: { organization_name: "Sandbox A" },
      });
      const r2 = await app.inject({
        method: "POST",
        url: "/sandbox/session",
        payload: { organization_name: "Sandbox B" },
      });
      expect(r1.statusCode).toBe(201);
      expect(r2.statusCode).toBe(201);
      const b1 = JSON.parse(r1.payload);
      const b2 = JSON.parse(r2.payload);
      expect(b1.organization_id).not.toBe(b2.organization_id);
      expect(b1.environment_mode).toBe("testnet");
      expect(b2.environment_mode).toBe("testnet");
    });
  });

  /* ================================================================ */
  /* EXISTING ROUTES REMAIN STABLE                                     */
  /* ================================================================ */

  describe("existing routes", () => {
    it("GET /health still works", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
    });

    it("POST /events still works with API key", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/events",
        headers: { "x-api-key": apiKeyPlain },
        payload: {
          organization_id: orgId,
          environment_id: envId,
          source_type_key: "e2e.cp_test",
          subject_id: subjectId,
          trace_id: `trace-stable-${randomUUID().slice(0, 8)}`,
          occurred_at: new Date().toISOString(),
          payload: { record_id: "stable-1", data: "test" },
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it("GET /subjects/:id/proofs still works with API key", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/subjects/${subjectId}/proofs`,
        headers: { "x-api-key": apiKeyPlain },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});

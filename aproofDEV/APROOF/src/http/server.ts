import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import type { Db } from "../db/client.js";
import { buildProductProof, ProductProofInputError } from "../product/build-product-proof.js";
import { buildFailureRollup } from "../product/failure-intelligence.js";
import { UniversalAngleContractError } from "../product/universal-contract.js";
import { processEvent } from "../pipeline/process-event.js";
import { logicalHashFields } from "../protocol/event-hashing.js";
import {
  type CanonicalIdentityContract as ApiIdentitySnapshot,
  buildCanonicalIdentityContract,
} from "../pipeline/identity-contract.js";
import { resolveApiKey } from "./auth-api-key.js";
import { pageMeta, parseLimitOffset } from "./api-pagination.js";
import { postEventBodySchema } from "./events-schema.js";
import { patchSubjectBodySchema } from "./patch-subject-schema.js";
import {
  applyFailuresListDisclosureView,
  applyProofDisclosureView,
  type ProofDisclosureView,
} from "./proof-disclosure.js";
import {
  ApiEnvelopeSchema,
  ProofListResponseSchema,
  FailuresListResponseSchema,
  ProofVerificationResponseSchema,
} from "./api-schema.js";
import { apiErrorEnvelope, notProofableApiError } from "./api-error-envelope.js";
import {
  attachProofListSummaryToEnvelope,
  finalizeEnvelopeProductProof,
} from "./proof-read-envelope.js";
import {
  resolveCanonicalEventIdForProofLookup,
  listEventIdsForSubject,
  listFailureLocatorsForScope,
  reconstructEventProofEnvelope,
} from "./reconstruct-proof-read.js";
import { verifyStoredProofById } from "./proof-verification-service.js";
import { subjects } from "../db/schema/index.js";
import {
  signUp,
  signIn,
  signOut,
  resolveSession,
  extractSessionToken,
  revokeSessionsForUserExceptCurrent,
} from "./auth-session.js";
import { cookieMutationCsrfAllowed, sendCookieCsrfBlocked } from "./csrf-cookie-mutation.js";
import { FixedWindowRateLimiter } from "./rate-limit-in-memory.js";
import {
  createSubject,
  getSubject,
  listSubjects,
  patchSubject,
  subjectExistsInScope,
} from "./subject-service.js";
import {
  getIntegrationBootstrap,
  getIntegrationStatus,
  listMappingsForSubjectEnv,
} from "./integration-read-service.js";
import { buildSandboxSessionSuccessBody } from "./sandbox-session-response.js";
import { clearEnvironmentGeneratedState, deleteEnvironmentSubjectGraph } from "./sandbox-env-reset.js";
import {
  DEMO_SUBJECT_RAIL_ORDER,
  demoSandboxSubjectId,
  isDemoSandboxAction,
  isSandboxScenarioTemplate,
  runSandboxScenario,
} from "./sandbox-scenario-runner.js";
import { applySandboxRailBaselineShapes } from "../demo/sandbox-rail-baseline-shapes.js";
import { runSandboxAnchorCoordinatorForSubject } from "../anchor/sandbox-anchor-coordinator.js";
import { resolveAnchorMode, resolveSolanaDevnetConfig } from "../anchor/solana-devnet-anchor.js";
import { applyPersistedAnchorToProductProof } from "./apply-persisted-anchor-to-product-proof.js";
import { buildSessionClearCookieHeader, buildSessionSetCookieHeader } from "./session-cookie.js";
import {
  buildSubjectOverview,
  OverviewBuildFailedError,
} from "./overview-read-model.js";
import {
  logDashboardBootExpectedDenial,
  logDashboardBootFailure,
  logDashboardBootSuccess,
} from "./dashboard-boot-log.js";
import { listEventsForSubject, getEventDetail } from "./events-read-service.js";
import {
  decodeUserLogCursor,
  getUserLogsForSubject,
  getSubjectUserLogSummary,
  ingestSubjectUserLogs,
} from "./subject-user-logs-service.js";
import { listLineagesForSubject, getLineageDetail } from "./lineage-read-service.js";
import { getFailureDetail, listFailuresForSubject } from "./failure-detail-service.js";
import {
  listBaselinesForSubject,
  getBaselineDetail,
  createBaselineVersion,
  patchSubjectBaselinesAngles,
  loadBaselineControlSnapshot,
} from "./baselines-service.js";
import {
  getApiSettings,
  createApiKey,
  revokeApiKey,
  getAccount,
  updateAccountEmail,
  updateAccountPassword,
  getOrganization,
  getOrganizationUsers,
  getEnvironment,
  updateEnvironmentName,
  updateEnvironmentMode,
} from "./settings-service.js";
import { RAIL_TYPES, type RailType } from "../protocol/angle-applicability.js";

/* ------------------------------------------------------------------ */
/* Shared helpers (eliminates route duplication)                       */
/* ------------------------------------------------------------------ */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestedProofView(request: { headers: Record<string, unknown> }): ProofDisclosureView {
  const headerView = request.headers["x-proof-view"];
  const v = typeof headerView === "string" ? headerView : undefined;
  if (v === "external" || v === "minimal" || v === "internal" || v === "adversarial_safe") return v;
  return "internal";
}

type AuthScope = {
  organizationId: string;
  environmentId: string;
};

async function authenticateRequest(
  db: Db,
  request: { headers: Record<string, unknown> },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): Promise<(AuthScope & { keyRow: Awaited<ReturnType<typeof resolveApiKey>> }) | null> {
  const headerKey = request.headers["x-api-key"];
  const secret = typeof headerKey === "string" ? headerKey : undefined;
  const keyRow = await resolveApiKey(db, secret);
  if (!keyRow) {
    reply
      .status(401)
      .send(apiErrorEnvelope("UNAUTHORIZED", "Invalid or missing API key."));
    return null;
  }
  return {
    organizationId: keyRow.organizationId,
    environmentId: keyRow.environmentId,
    keyRow,
  };
}

/** Proof read routes accept API key (integrators) or cookie session (control-plane UI). */
async function authenticateApiKeyOrSessionForProofReads(
  db: Db,
  request: { headers: Record<string, unknown> },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): Promise<AuthScope | null> {
  const headerKey = request.headers["x-api-key"];
  const secret = typeof headerKey === "string" ? headerKey : undefined;
  const keyRow = await resolveApiKey(db, secret);
  if (keyRow) {
    return {
      organizationId: keyRow.organizationId,
      environmentId: keyRow.environmentId,
    };
  }
  const cookie = typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;
  const token = extractSessionToken(cookie);
  const session = await resolveSession(db, token);
  if (session) {
    return {
      organizationId: session.organization_id,
      environmentId: session.environment_id,
    };
  }
  reply
    .status(401)
    .send(apiErrorEnvelope("UNAUTHORIZED", "Invalid or missing authentication."));
  return null;
}

function validateUuidParam(
  value: string,
  fieldName: string,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): boolean {
  if (!UUID_RE.test(value)) {
    reply
      .status(400)
      .send(
        apiErrorEnvelope("INVALID_ID", `Parameter "${fieldName}" must be a UUID.`, {
          field: fieldName,
        })
      );
    return false;
  }
  return true;
}

function handleProofBuildError(
  error: unknown,
  request: { log: { error: (...args: unknown[]) => void } },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): unknown {
  if (error instanceof ProductProofInputError) {
    request.log.error({ error }, "Product proof input / event identity validation failed");
    return reply.status(422).send(
      apiErrorEnvelope(error.code, error.message, {
        ...(error.detail !== undefined ? { detail: error.detail } : {}),
      })
    );
  }
  if (error instanceof UniversalAngleContractError) {
    request.log.error({ error }, "Proof contract validation failed");
    return reply.status(500).send(
      apiErrorEnvelope("ANGLE_CONTRACT_ERROR", "Proof contract validation failed.", {
        failure_locator: error.failure_locator,
        contract_code: error.code,
      })
    );
  }
  request.log.error({ error }, "Unexpected proof build failure");
  return reply
    .status(500)
    .send(apiErrorEnvelope("INTERNAL_ERROR", "An unexpected error occurred while building the proof."));
}

function requireDevnetForSandboxDemo(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): boolean {
  const guardEnabled = process.env.APROOF_REQUIRE_DEVNET_FOR_DEMO !== "0";
  if (!guardEnabled) return true;
  if (resolveAnchorMode(process.env) !== "solana-devnet") {
    reply
      .status(412)
      .send(
        apiErrorEnvelope(
          "DEMO_REQUIRES_DEVNET",
          "Sandbox demo requires ANCHOR_MODE=solana-devnet with valid Solana Devnet configuration.",
        ),
      );
    return false;
  }
  try {
    resolveSolanaDevnetConfig(process.env);
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    reply
      .status(412)
      .send(
        apiErrorEnvelope(
          "DEMO_REQUIRES_DEVNET",
          "Sandbox demo requires valid Solana Devnet configuration.",
          { detail: msg },
        ),
      );
    return false;
  }
}

function sendInternalValidated<T>(
  schema: { parse: (value: unknown) => T },
  payload: unknown,
  statusCode: number,
  request: { log: { error: (...args: unknown[]) => void } },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): unknown {
  try {
    return reply.status(statusCode).send(schema.parse(payload));
  } catch (error) {
    request.log.error({ error }, "Internal response schema validation failed");
    return reply
      .status(500)
      .send(
        apiErrorEnvelope(
          "INTERNAL_SCHEMA_VALIDATION_FAILED",
          "Response did not match the internal API contract."
        )
      );
  }
}

/* ------------------------------------------------------------------ */
/* CORS configuration                                                 */
/* ------------------------------------------------------------------ */

function resolveCorsOrigin(): boolean | string | string[] {
  const env = process.env.APROOF_CORS_ORIGINS?.trim();
  if (!env) return true;
  const origins = env.split(",").map((o) => o.trim()).filter(Boolean);
  return origins.length > 0 ? origins : true;
}

/* ------------------------------------------------------------------ */
/* Server builder                                                     */
/* ------------------------------------------------------------------ */

export function buildServer(db: Db) {
  const app = Fastify({ logger: true });
  /**
   * Local dev normally uses the Vite proxy (same origin as the SPA). `credentials: true` stays valid
   * for explicit cross-origin setups (e.g. `VITE_API_BASE_URL` to another origin) or tooling.
   */
  app.register(cors, { origin: resolveCorsOrigin(), credentials: true });

  const authRlDisabled = process.env.APROOF_RATE_LIMIT_DISABLED === "1";
  const authRouteLimiter = new FixedWindowRateLimiter(
    Number(process.env.APROOF_AUTH_RL_MAX ?? "120"),
    Number(process.env.APROOF_AUTH_RL_WINDOW_MS ?? "60000"),
  );

  app.addHook("preHandler", async (request, reply) => {
    if (reply.sent) return;
    const path = request.url.split("?")[0];
    const method = request.method.toUpperCase();
    if (!authRlDisabled && method === "POST") {
      const rlPaths = ["/auth/sign-in", "/auth/sign-up", "/sandbox/session", "/sandbox/reset"];
      if (rlPaths.includes(path)) {
        const ip = request.ip ?? "unknown";
        if (!authRouteLimiter.isAllowed(`${ip}:${path}`)) {
          reply.status(429).send(apiErrorEnvelope("RATE_LIMITED", "Too many requests. Try again later."));
          return;
        }
      }
    }
    if (!cookieMutationCsrfAllowed(request)) {
      // Sign-out must work when the SPA origin and API origin differ (e.g. localhost:5173 → 127.0.0.1:3000),
      // which browsers label as cross-site. Logout CSRF is low risk compared to leaving users stuck signed in.
      if (path !== "/auth/sign-out") {
        sendCookieCsrfBlocked(reply);
        return;
      }
    }
  });

  /* ---- Root (avoids a bare 404 when someone opens the API port in a browser) ---- */
  app.get("/", async (_request, reply) =>
    reply.status(200).send({
      ok: true,
      service: "aproof",
      hint: "This URL is the API. Run the frontend (e.g. npm run dev in frontend/) on port 5173, or vite preview on 4173 with the API on 3000.",
      health: "/health",
    }),
  );

  /* ---- GET /health (no auth; local readiness) ---- */
  app.get("/health", async (_request, reply) =>
    reply.status(200).send({ ok: true, status: "ok", service: "aproof" })
  );

  /* ---- POST /events ---- */
  app.post("/events", async (request, reply) => {
    const requestedView = requestedProofView(request);
    const auth = await authenticateRequest(db, request, reply);
    if (!auth) return;

    const parsed = postEventBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiErrorEnvelope("INVALID_BODY", "Request body validation failed.", {
          validation: parsed.error.flatten(),
        })
      );
    }

    const body = parsed.data;
    if (body.organization_id !== auth.organizationId || body.environment_id !== auth.environmentId) {
      return reply
        .status(403)
        .send(
          apiErrorEnvelope(
            "SCOPE_MISMATCH",
            "Organization or environment in the body does not match the API key scope."
          )
        );
    }

    const result = await processEvent(db, body);
    if (!result.ok) {
      return reply
        .status(422)
        .send(
          notProofableApiError({
            reason: result.reason,
            raw_event_id: result.raw_event_id,
            pipeline_code: result.code,
          })
        );
    }

    let product_proof;
    try {
      const baselineControlByAngle = await loadBaselineControlSnapshot(db, {
        subjectId: body.subject_id,
        organizationId: body.organization_id,
        environmentId: body.environment_id,
      });
      product_proof = buildProductProof({
        body,
        pipeline: result,
        receivedAt: result.proof_build_received_at,
        baselineControlByAngle,
      });
      await runSandboxAnchorCoordinatorForSubject(db, {
        subjectId: body.subject_id,
        organizationId: body.organization_id,
        environmentId: body.environment_id,
      });
      await applyPersistedAnchorToProductProof(db, result.event_id, product_proof);
    } catch (error) {
      return handleProofBuildError(error, request, reply);
    }

    const failure_intelligence = buildFailureRollup(product_proof, result);
    const identity: ApiIdentitySnapshot = buildCanonicalIdentityContract({
      event_id: result.lineage.event_id,
      artifact_id: result.lineage.artifact_id,
      event_lineage_id: result.lineage.event_lineage_id,
      event_version: result.lineage.event_version,
      canonical_hash: result.lineage.canonical_hash,
      logical_hash: logicalHashFields({
        subject_id: body.subject_id,
        event_type: result.canonical_event_type,
        payload: body.payload,
      }),
    });

    const responseBody: Record<string, unknown> = {
      ...result, identity, product_proof, failure_intelligence,
    };
    finalizeEnvelopeProductProof(responseBody);

    if (requestedView === "internal") {
      return sendInternalValidated(ApiEnvelopeSchema, responseBody, 201, request, reply);
    }
    return reply.status(201).send(applyProofDisclosureView(responseBody, requestedView));
  });

  /* ---- GET /proofs/:id ---- */
  app.get("/proofs/:id", async (request, reply) => {
    const requestedView = requestedProofView(request);
    const auth = await authenticateApiKeyOrSessionForProofReads(db, request, reply);
    if (!auth) return;

    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;

    const eventId = await resolveCanonicalEventIdForProofLookup(db, {
      id, organizationId: auth.organizationId, environmentId: auth.environmentId,
    });
    if (!eventId) {
      return reply
        .status(404)
        .send(apiErrorEnvelope("NOT_FOUND", "Proof or event not found.", { resource: "proof" }));
    }

    let reconstructed;
    try {
      reconstructed = await reconstructEventProofEnvelope(db, {
        eventId, organizationId: auth.organizationId, environmentId: auth.environmentId,
      });
    } catch (error) {
      return handleProofBuildError(error, request, reply);
    }

    if (reconstructed === null) {
      return reply.status(404).send(
        apiErrorEnvelope("NOT_FOUND", "Proof or stored event payload not found.", {
          resource: "proof",
          detail: "canonical_event_missing",
        })
      );
    }
    if (!reconstructed.ok) {
      return reply
        .status(422)
        .send(
          notProofableApiError({
            reason: reconstructed.reason,
            raw_event_id: reconstructed.raw_event_id,
            pipeline_code: reconstructed.code,
          })
        );
    }

    if (requestedView === "internal") {
      return sendInternalValidated(ApiEnvelopeSchema, reconstructed.envelope, 200, request, reply);
    }
    return reply.status(200).send(applyProofDisclosureView(reconstructed.envelope, requestedView));
  });

  /* ---- GET /proofs/:id/verification ---- */
  app.get("/proofs/:id/verification", async (request, reply) => {
    const auth = await authenticateApiKeyOrSessionForProofReads(db, request, reply);
    if (!auth) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;

    const verification = await verifyStoredProofById(db, {
      proofId: id,
      organizationId: auth.organizationId,
      environmentId: auth.environmentId,
    });
    if (!verification) {
      return reply
        .status(404)
        .send(apiErrorEnvelope("NOT_FOUND", "Proof not found.", { resource: "proof" }));
    }

    return sendInternalValidated(ProofVerificationResponseSchema, verification, 200, request, reply);
  });

  /* ---- GET /subjects/:id/proofs ---- */
  app.get("/subjects/:id/proofs", async (request, reply) => {
    const requestedView = requestedProofView(request);
    const auth = await authenticateApiKeyOrSessionForProofReads(db, request, reply);
    if (!auth) return;

    const subjectId = (request.params as { id: string }).id;
    if (!validateUuidParam(subjectId, "id", reply)) return;

    const [subRow] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.organizationId, auth.organizationId), eq(subjects.environmentId, auth.environmentId)))
      .limit(1);
    if (!subRow) {
      return reply
        .status(404)
        .send(apiErrorEnvelope("NOT_FOUND", "Subject not found.", { resource: "subject" }));
    }

    const { limit, offset } = parseLimitOffset(request.query as Record<string, string | string[] | undefined>);
    const { eventIds, total } = await listEventIdsForSubject(db, {
      organizationId: auth.organizationId, environmentId: auth.environmentId, subjectId, limit, offset,
    });

    const items: Record<string, unknown>[] = [];
    for (const eventId of eventIds) {
      try {
        const rec = await reconstructEventProofEnvelope(db, {
          eventId, organizationId: auth.organizationId, environmentId: auth.environmentId,
        });
        if (rec?.ok) {
          attachProofListSummaryToEnvelope(rec.envelope);
          items.push(applyProofDisclosureView(rec.envelope, requestedView));
        }
      } catch (error) {
        return handleProofBuildError(error, request, reply);
      }
    }

    const responseBody = { items, page: pageMeta(limit, offset, total) };
    if (requestedView === "internal") {
      return sendInternalValidated(ProofListResponseSchema, responseBody, 200, request, reply);
    }
    return reply.status(200).send(responseBody);
  });

  /* ---- GET /failures ---- */
  app.get("/failures", async (request, reply) => {
    const requestedView = requestedProofView(request);
    const auth = await authenticateRequest(db, request, reply);
    if (!auth) return;

    const q = request.query as Record<string, string | string[] | undefined>;
    const rawSubject = Array.isArray(q.subject_id) ? q.subject_id[0] : q.subject_id;
    if (rawSubject !== undefined && rawSubject !== "" && !UUID_RE.test(rawSubject)) {
      return reply
        .status(400)
        .send(
          apiErrorEnvelope("INVALID_ID", 'Query parameter "subject_id" must be a UUID.', {
            field: "subject_id",
          })
        );
    }

    const { limit, offset } = parseLimitOffset(q);
    const subjectId = rawSubject && rawSubject !== "" && UUID_RE.test(rawSubject) ? rawSubject : undefined;

    const { items, total } = await listFailureLocatorsForScope(db, {
      organizationId: auth.organizationId, environmentId: auth.environmentId, subjectId, limit, offset,
    });

    const responseBody = { items, page: pageMeta(limit, offset, total) };
    if (requestedView === "internal") {
      return sendInternalValidated(FailuresListResponseSchema, responseBody, 200, request, reply);
    }
    return reply.status(200).send(applyFailuresListDisclosureView(responseBody, requestedView));
  });

  /* ================================================================== */
  /* Session auth helper (cookie-based, coexists with API-key auth)     */
  /* ================================================================== */

  type SessionScope = {
    userId: string;
    organizationId: string;
    environmentId: string;
    environmentName: string;
  };

  async function authenticateSession(
    db: Db,
    request: { headers: Record<string, unknown> },
    reply: { status: (code: number) => { send: (body: unknown) => unknown } }
  ): Promise<SessionScope | null> {
    const cookie = typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;
    const token = extractSessionToken(cookie);
    const session = await resolveSession(db, token);
    if (!session) {
      reply.status(401).send(apiErrorEnvelope("UNAUTHORIZED", "Invalid or expired session."));
      return null;
    }
    return {
      userId: session.user_id,
      organizationId: session.organization_id,
      environmentId: session.environment_id,
      environmentName: session.environment,
    };
  }

  async function assertSubjectInScope(
    subjectId: string,
    session: SessionScope,
    reply: FastifyReply,
  ): Promise<boolean> {
    const ok = await subjectExistsInScope(db, {
      subjectId,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!ok) {
      reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
      return false;
    }
    return true;
  }

  /* ================================================================== */
  /* A. AUTH / SESSION LAYER                                            */
  /* ================================================================== */

  app.post("/auth/sign-up", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return reply.status(400).send(apiErrorEnvelope("INVALID_BODY", "Request body required."));
    const result = await signUp(db, {
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      organization_name: String(body.organization_name ?? ""),
    });
    if (!result.ok) {
      const status = result.code === "CONFLICT" ? 409 : 400;
      request.log.info({ audit: true, action: "auth.sign_up", outcome: "failure", code: result.code });
      return reply.status(status).send(apiErrorEnvelope(result.code, result.message));
    }
    reply.header("set-cookie", buildSessionSetCookieHeader(result.session_token));
    request.log.info({ audit: true, action: "auth.sign_up", outcome: "success", user_id: result.user_id });
    return reply.status(201).send({
      ok: true,
      user_id: result.user_id,
      organization_id: result.organization_id,
      environment_id: result.environment_id,
      expires_at: result.expires_at,
    });
  });

  app.post("/auth/sign-in", async (request, reply) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body) return reply.status(400).send(apiErrorEnvelope("INVALID_BODY", "Request body required."));
    const result = await signIn(db, {
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
    });
    if (!result.ok) {
      request.log.info({ audit: true, action: "auth.sign_in", outcome: "failure", code: result.code });
      return reply.status(401).send(apiErrorEnvelope(result.code, result.message));
    }
    reply.header("set-cookie", buildSessionSetCookieHeader(result.session_token));
    request.log.info({ audit: true, action: "auth.sign_in", outcome: "success", user_id: result.user_id });
    return reply.status(200).send({
      ok: true,
      user_id: result.user_id,
      organization_id: result.organization_id,
      environment_id: result.environment_id,
      expires_at: result.expires_at,
    });
  });

  app.post("/auth/sign-out", async (request, reply) => {
    const cookie = typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;
    const token = extractSessionToken(cookie);
    if (token) {
      const sess = await resolveSession(db, token);
      await signOut(db, token);
      if (sess) {
        request.log.info({ audit: true, action: "auth.sign_out", user_id: sess.user_id });
      } else {
        request.log.info({ audit: true, action: "auth.sign_out", outcome: "invalid_or_expired_token" });
      }
    } else {
      request.log.info({ audit: true, action: "auth.sign_out", outcome: "no_cookie" });
    }
    reply.header("set-cookie", buildSessionClearCookieHeader());
    return reply.status(200).send({ ok: true });
  });

  app.get("/auth/session", async (request, reply) => {
    try {
      const cookie = typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;
      const token = extractSessionToken(cookie);
      const session = await resolveSession(db, token);
      if (!session) {
        logDashboardBootExpectedDenial(request, "GET /auth/session", "no_active_session");
        // 200 + explicit body avoids browser console noise (401 logged as failed fetch) while unauthenticated;
        // protected routes still use 401 via authenticateSession().
        return reply.status(200).send({ authenticated: false });
      }
      logDashboardBootSuccess(request, "GET /auth/session", {
        organization_id: session.organization_id,
        environment_id: session.environment_id,
      });
      return reply.status(200).send(session);
    } catch (err) {
      logDashboardBootFailure(request, "GET /auth/session", err);
      if (!reply.sent) {
        return reply.status(500).send(apiErrorEnvelope("INTERNAL_ERROR", "Session resolution failed."));
      }
    }
  });

  /* ================================================================== */
  /* B. SUBJECT LIFECYCLE LAYER                                         */
  /* ================================================================== */

  app.post("/subjects", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const body = request.body as Record<string, unknown> | undefined;
    const rawRail = String(body?.subject_type ?? body?.rail_type ?? "service");
    if (!(RAIL_TYPES as readonly string[]).includes(rawRail)) {
      return reply.status(400).send(
        apiErrorEnvelope("INVALID_BODY", "Invalid subject_type (rail).", {
          subject_type: rawRail,
          allowed: [...RAIL_TYPES],
        }),
      );
    }
    const railType = rawRail as RailType;
    const externalKey = body?.external_key ? String(body.external_key) : undefined;
    const result = await createSubject(db, {
      organizationId: session.organizationId,
      environmentId: session.environmentId,
      railType,
      externalKey,
    });
    request.log.info({
      audit: true,
      action: "subject.create",
      subject_id: result.subject_id,
      organization_id: session.organizationId,
      environment_id: session.environmentId,
    });
    return reply.status(201).send(result);
  });

  app.get("/subjects", async (request, reply) => {
    try {
      const session = await authenticateSession(db, request, reply);
      if (!session) {
        logDashboardBootExpectedDenial(request, "GET /subjects", "unauthenticated");
        return;
      }
      const { limit, offset } = parseLimitOffset(request.query as Record<string, string | string[] | undefined>);
      const result = await listSubjects(db, {
        organizationId: session.organizationId,
        environmentId: session.environmentId,
        limit,
        offset,
      });
      logDashboardBootSuccess(request, "GET /subjects", {
        organization_id: session.organizationId,
        environment_id: session.environmentId,
      });
      return reply.status(200).send({ items: result.items, page: pageMeta(limit, offset, result.total) });
    } catch (err) {
      logDashboardBootFailure(request, "GET /subjects", err);
      if (!reply.sent) {
        return reply.status(500).send(apiErrorEnvelope("INTERNAL_ERROR", "Failed to list subjects."));
      }
    }
  });

  app.get("/subjects/:id", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    const result = await getSubject(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!result) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
    return reply.status(200).send(result);
  });

  app.get("/subjects/:id/integration-bootstrap", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const result = await getIntegrationBootstrap(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!result) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
    return reply.status(200).send(result);
  });

  app.get("/subjects/:id/integration-status", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const result = await getIntegrationStatus(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!result) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
    return reply.status(200).send(result);
  });

  app.get("/subjects/:id/mappings", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const result = await listMappingsForSubjectEnv(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!result) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
    return reply.status(200).send(result);
  });

  app.patch("/subjects/:id", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    const parsed = patchSubjectBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send(
        apiErrorEnvelope("INVALID_BODY", "Request body validation failed.", {
          validation: parsed.error.flatten(),
        })
      );
    }
    const body = parsed.data;
    const result = await patchSubject(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
      externalKey: body.external_key,
    });
    if (!result) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
    request.log.info({
      audit: true,
      action: "subject.patch",
      subject_id: id,
      organization_id: session.organizationId,
      environment_id: session.environmentId,
    });
    return reply.status(200).send(result);
  });

  /* ================================================================== */
  /* C. OVERVIEW READ MODEL                                             */
  /* ================================================================== */

  app.get("/subjects/:id/overview", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) {
      logDashboardBootExpectedDenial(request, "GET /subjects/:id/overview", "unauthenticated");
      return;
    }
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) {
      logDashboardBootExpectedDenial(request, "GET /subjects/:id/overview", "subject_not_in_scope", {
        organization_id: session.organizationId,
        environment_id: session.environmentId,
        subject_id: id,
      });
      return;
    }
    try {
      const overview = await buildSubjectOverview(db, {
        subjectId: id,
        organizationId: session.organizationId,
        environmentId: session.environmentId,
        environmentName: session.environmentName,
      });
      if (!overview) {
        logDashboardBootExpectedDenial(request, "GET /subjects/:id/overview", "subject_not_found", {
          organization_id: session.organizationId,
          environment_id: session.environmentId,
          subject_id: id,
        });
        return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
      }
      logDashboardBootSuccess(request, "GET /subjects/:id/overview", {
        organization_id: session.organizationId,
        environment_id: session.environmentId,
        subject_id: id,
      });
      return reply.status(200).send(overview);
    } catch (err) {
      logDashboardBootFailure(request, "GET /subjects/:id/overview", err, {
        organization_id: session.organizationId,
        environment_id: session.environmentId,
        subject_id: id,
      });
      if (!reply.sent) {
        const message =
          err instanceof OverviewBuildFailedError
            ? "Overview could not be built."
            : "Unexpected error building overview.";
        return reply.status(500).send(apiErrorEnvelope("INTERNAL_ERROR", message));
      }
    }
  });

  /* ================================================================== */
  /* D. EVENTS READ LAYER                                               */
  /* ================================================================== */

  app.get("/subjects/:id/events", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const { limit, offset } = parseLimitOffset(request.query as Record<string, string | string[] | undefined>);
    const result = await listEventsForSubject(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
      limit,
      offset,
    });
    return reply.status(200).send({ items: result.items, page: pageMeta(limit, offset, result.total) });
  });

  /* ================================================================== */
  /* D.1 SUBJECT USER LOGS (non-proof, full ingestion + read)           */
  /* ================================================================== */

  app.get("/subjects/:id/user-logs/summary", async (request, reply) => {
    const auth = await authenticateApiKeyOrSessionForProofReads(db, request, reply);
    if (!auth) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (
      !(await subjectExistsInScope(db, {
        subjectId: id,
        organizationId: auth.organizationId,
        environmentId: auth.environmentId,
      }))
    ) {
      return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
    }
    try {
      const summary = await getSubjectUserLogSummary(db, {
        organizationId: auth.organizationId,
        environmentId: auth.environmentId,
        subjectId: id,
      });
      return reply.status(200).send(summary);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send(apiErrorEnvelope("INTERNAL_ERROR", "Failed to load user log summary."));
    }
  });

  app.get("/subjects/:id/user-logs", async (request, reply) => {
    const auth = await authenticateApiKeyOrSessionForProofReads(db, request, reply);
    if (!auth) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (
      !(await subjectExistsInScope(db, {
        subjectId: id,
        organizationId: auth.organizationId,
        environmentId: auth.environmentId,
      }))
    ) {
      return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
    }
    const q = request.query as Record<string, string | string[] | undefined>;
    const cursorRaw = typeof q.cursor === "string" ? q.cursor : undefined;
    if (cursorRaw && !decodeUserLogCursor(cursorRaw)) {
      return reply.status(400).send(apiErrorEnvelope("INVALID_QUERY", "Invalid cursor."));
    }
    const searchQ = typeof q.q === "string" ? q.q : undefined;
    const actionType = typeof q.action_type === "string" ? q.action_type : undefined;
    const relation = typeof q.relation === "string" ? q.relation : undefined;
    const sortRaw = typeof q.sort === "string" ? q.sort : "newest";
    const sort = sortRaw === "oldest" ? "oldest" : "newest";
    const limitRaw = typeof q.limit === "string" ? Number(q.limit) : undefined;
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
    const offsetRaw = typeof q.offset === "string" ? Number(q.offset) : undefined;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Number(offsetRaw)) : 0;
    try {
      const env = await getEnvironment(db, {
        environmentId: auth.environmentId,
        organizationId: auth.organizationId,
      });
      const environmentLabel =
        env?.mode === "testnet" && env?.name?.toLowerCase() === "sandbox"
          ? "sandbox"
          : env?.mode ?? "production";
      const result = await getUserLogsForSubject(db, {
        organizationId: auth.organizationId,
        environmentId: auth.environmentId,
        subjectId: id,
        q: searchQ,
        action_type: actionType,
        relation: relation as "any" | "none" | "has_proof" | "has_event" | "has_lineage" | "" | undefined,
        sort,
        limit,
        offset,
        cursor: cursorRaw,
        environmentLabel,
      });
      return reply.status(200).send(result);
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_USER_LOG_CURSOR") {
        return reply.status(400).send(apiErrorEnvelope("INVALID_QUERY", "Invalid cursor."));
      }
      request.log.error(e);
      return reply.status(500).send(apiErrorEnvelope("INTERNAL_ERROR", "Failed to list user logs."));
    }
  });

  app.post("/subjects/:id/user-logs", async (request, reply) => {
    const auth = await authenticateApiKeyOrSessionForProofReads(db, request, reply);
    if (!auth) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (
      !(await subjectExistsInScope(db, {
        subjectId: id,
        organizationId: auth.organizationId,
        environmentId: auth.environmentId,
      }))
    ) {
      return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Subject not found."));
    }
    const body = request.body as { logs?: unknown } | undefined;
    if (!body || !Array.isArray(body.logs)) {
      return reply.status(400).send(apiErrorEnvelope("INVALID_BODY", "Request body must include a logs array."));
    }
    const result = await ingestSubjectUserLogs(db, {
      organizationId: auth.organizationId,
      environmentId: auth.environmentId,
      subjectId: id,
      logs: body.logs as import("./subject-user-logs-service.js").IngestUserLogInput[],
    });
    if ("error" in result) {
      return reply.status(400).send(
        apiErrorEnvelope("INVALID_BODY", result.error, result.index !== undefined ? { index: result.index } : undefined)
      );
    }
    return reply.status(201).send({ ok: true, inserted: result.inserted });
  });

  app.get("/events/:id", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    const detail = await getEventDetail(db, {
      eventId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!detail) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Event not found."));
    return reply.status(200).send(detail);
  });

  /* ================================================================== */
  /* E. TRACEABILITY / LINEAGE READ LAYER                               */
  /* ================================================================== */

  app.get("/subjects/:id/lineages", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const { limit, offset } = parseLimitOffset(request.query as Record<string, string | string[] | undefined>);
    const result = await listLineagesForSubject(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
      limit,
      offset,
    });
    return reply.status(200).send({ items: result.items, page: pageMeta(limit, offset, result.total) });
  });

  app.get("/lineages/:id", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    const detail = await getLineageDetail(db, {
      lineageId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!detail) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Lineage not found."));
    return reply.status(200).send(detail);
  });

  /* ================================================================== */
  /* F. FAILURE DETAIL LAYER                                            */
  /* ================================================================== */

  app.get("/subjects/:id/failures", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const { limit, offset } = parseLimitOffset(request.query as Record<string, string | string[] | undefined>);
    const result = await listFailuresForSubject(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
      limit,
      offset,
    });
    return reply.status(200).send({ items: result.items, page: pageMeta(limit, offset, result.total) });
  });

  app.get("/failures/:id", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    const detail = await getFailureDetail(db, {
      failureId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!detail) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Failure not found."));
    return reply.status(200).send(detail);
  });

  /* ================================================================== */
  /* G. BASELINES / ANGLES LAYER                                        */
  /* ================================================================== */

  app.get("/subjects/:id/baselines", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const result = await listBaselinesForSubject(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    return reply.status(200).send({ baselines: result });
  });

  app.patch("/subjects/:id/baselines", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const id = (request.params as { id: string }).id;
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const body = request.body as Record<string, unknown> | undefined;
    const angles = body?.angles;
    if (!angles || typeof angles !== "object" || Array.isArray(angles)) {
      return reply.status(400).send(apiErrorEnvelope("INVALID_BODY", "Request body must include an object `angles`."));
    }
    const result = await patchSubjectBaselinesAngles(db, {
      subjectId: id,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
      angles: angles as Record<string, unknown>,
    });
    if (!result.ok) {
      return reply.status(400).send(apiErrorEnvelope("INVALID_BODY", result.error));
    }
    return reply.status(200).send({ baselines: result.baselines });
  });

  app.get("/subjects/:id/baselines/:angle", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const { id, angle } = request.params as { id: string; angle: string };
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const detail = await getBaselineDetail(db, {
      subjectId: id,
      angle,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!detail) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Baseline angle not found."));
    return reply.status(200).send(detail);
  });

  app.post("/subjects/:id/baselines/:angle/versions", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const { id, angle } = request.params as { id: string; angle: string };
    if (!validateUuidParam(id, "id", reply)) return;
    if (!(await assertSubjectInScope(id, session, reply))) return;
    const body = request.body as Record<string, unknown> | undefined;
    const detail = await createBaselineVersion(db, {
      subjectId: id,
      angle,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
      definition: body?.definition ?? {},
    });
    if (!detail) return reply.status(400).send(apiErrorEnvelope("INVALID_ANGLE", "Invalid angle name."));
    return reply.status(201).send(detail);
  });

  /* ================================================================== */
  /* H. SETTINGS / CONTROL-PLANE LAYER                                  */
  /* ================================================================== */

  app.get("/settings/api", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const result = await getApiSettings(db, {
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    return reply.status(200).send(result);
  });

  app.post("/settings/api-keys", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const body = request.body as Record<string, unknown> | undefined;
    const result = await createApiKey(db, {
      organizationId: session.organizationId,
      environmentId: session.environmentId,
      name: String(body?.name ?? ""),
    });
    request.log.info({
      audit: true,
      action: "settings.api_key_create",
      key_id: result.id,
      organization_id: session.organizationId,
      environment_id: session.environmentId,
    });
    return reply.status(201).send(result);
  });

  app.delete("/settings/api-keys/:id", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const keyId = (request.params as { id: string }).id;
    if (!validateUuidParam(keyId, "id", reply)) return;
    const revoked = await revokeApiKey(db, {
      keyId,
      organizationId: session.organizationId,
      environmentId: session.environmentId,
    });
    if (!revoked) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "API key not found or already revoked."));
    request.log.info({
      audit: true,
      action: "settings.api_key_revoke",
      key_id: keyId,
      organization_id: session.organizationId,
      environment_id: session.environmentId,
    });
    return reply.status(200).send({ ok: true });
  });

  app.get("/settings/account", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const account = await getAccount(db, session.userId);
    if (!account) return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Account not found."));
    return reply.status(200).send(account);
  });

  app.patch("/settings/account", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const body = request.body as Record<string, unknown> | undefined;
    if (body?.email) {
      const ok = await updateAccountEmail(db, { userId: session.userId, email: String(body.email) });
      if (!ok) return reply.status(409).send(apiErrorEnvelope("CONFLICT", "Email already in use."));
    }
    if (body?.current_password && body?.new_password) {
      const pwResult = await updateAccountPassword(db, {
        userId: session.userId,
        current_password: String(body.current_password),
        new_password: String(body.new_password),
      });
      if (!pwResult.ok) {
        const status = pwResult.code === "UNAUTHORIZED" ? 401 : 400;
        request.log.info({ audit: true, action: "settings.password_change", outcome: "failure", code: pwResult.code });
        return reply.status(status).send(apiErrorEnvelope(pwResult.code, pwResult.message));
      }
      const cookie = typeof request.headers.cookie === "string" ? request.headers.cookie : undefined;
      await revokeSessionsForUserExceptCurrent(db, session.userId, extractSessionToken(cookie));
      request.log.info({ audit: true, action: "settings.password_change", outcome: "success", user_id: session.userId });
    }
    const account = await getAccount(db, session.userId);
    if (!account) {
      return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Account not found."));
    }
    return reply.status(200).send(account);
  });

  app.get("/settings/organization", async (request, reply) => {
    try {
      const session = await authenticateSession(db, request, reply);
      if (!session) {
        logDashboardBootExpectedDenial(request, "GET /settings/organization", "unauthenticated");
        return;
      }
      const org = await getOrganization(db, session.organizationId);
      if (!org) {
        logDashboardBootExpectedDenial(request, "GET /settings/organization", "organization_not_found", {
          organization_id: session.organizationId,
          environment_id: session.environmentId,
        });
        return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Organization not found."));
      }
      logDashboardBootSuccess(request, "GET /settings/organization", {
        organization_id: session.organizationId,
        environment_id: session.environmentId,
      });
      return reply.status(200).send(org);
    } catch (err) {
      logDashboardBootFailure(request, "GET /settings/organization", err);
      if (!reply.sent) {
        return reply.status(500).send(apiErrorEnvelope("INTERNAL_ERROR", "Unexpected error loading organization."));
      }
    }
  });

  app.get("/settings/organization/users", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const usersList = await getOrganizationUsers(db, session.organizationId);
    return reply.status(200).send({ users: usersList });
  });

  app.get("/settings/environment", async (request, reply) => {
    try {
      const session = await authenticateSession(db, request, reply);
      if (!session) {
        logDashboardBootExpectedDenial(request, "GET /settings/environment", "unauthenticated");
        return;
      }
      const env = await getEnvironment(db, {
        environmentId: session.environmentId,
        organizationId: session.organizationId,
      });
      if (!env) {
        logDashboardBootExpectedDenial(request, "GET /settings/environment", "environment_not_found", {
          organization_id: session.organizationId,
          environment_id: session.environmentId,
        });
        return reply.status(404).send(apiErrorEnvelope("NOT_FOUND", "Environment not found."));
      }
      logDashboardBootSuccess(request, "GET /settings/environment", {
        organization_id: session.organizationId,
        environment_id: session.environmentId,
      });
      return reply.status(200).send(env);
    } catch (err) {
      logDashboardBootFailure(request, "GET /settings/environment", err);
      if (!reply.sent) {
        return reply.status(500).send(apiErrorEnvelope("INTERNAL_ERROR", "Unexpected error loading environment."));
      }
    }
  });

  app.patch("/settings/environment", async (request, reply) => {
    const session = await authenticateSession(db, request, reply);
    if (!session) return;
    const body = request.body as Record<string, unknown> | undefined;
    const envBefore = await getEnvironment(db, {
      environmentId: session.environmentId,
      organizationId: session.organizationId,
    });
    const VALID_MODES = ["testnet", "staging", "production"] as const;
    if (body?.mode && typeof body.mode === "string") {
      if (!VALID_MODES.includes(body.mode as typeof VALID_MODES[number])) {
        return reply.status(400).send(apiErrorEnvelope("INVALID_INPUT", `mode must be one of: ${VALID_MODES.join(", ")}`));
      }
      const nextMode = body.mode as typeof VALID_MODES[number];
      if (envBefore && envBefore.mode !== nextMode) {
        request.log.info({
          audit: true,
          action: "settings.environment_mode_change",
          environment_id: session.environmentId,
          from_mode: envBefore.mode,
          to_mode: nextMode,
        });
      }
      await updateEnvironmentMode(db, {
        environmentId: session.environmentId,
        organizationId: session.organizationId,
        mode: nextMode,
      });
    }
    if (body?.name && typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (envBefore && trimmed && envBefore.name !== trimmed) {
        request.log.info({
          audit: true,
          action: "settings.environment_name_change",
          environment_id: session.environmentId,
        });
      }
      await updateEnvironmentName(db, {
        environmentId: session.environmentId,
        organizationId: session.organizationId,
        name: body.name,
      });
    }
    const env = await getEnvironment(db, {
      environmentId: session.environmentId,
      organizationId: session.organizationId,
    });
    return reply.status(200).send(env);
  });

  /* ================================================================== */
  /* I. TESTNET / SANDBOX ACCESS PATH                                   */
  /* ================================================================== */

  const demoStateCache = new Map<string, { data: unknown; expiresAt: number }>();

  app.post("/sandbox/session", async (request, reply) => {
    try {
      if (!requireDevnetForSandboxDemo(reply)) return;
      const body = request.body as Record<string, unknown> | undefined;
      const templateRaw = body?.template;
      const template =
        typeof templateRaw === "string" && templateRaw.trim().length > 0 ? templateRaw.trim() : undefined;
      if (template !== undefined && !isSandboxScenarioTemplate(template)) {
        return reply
          .status(400)
          .send(
            apiErrorEnvelope("INVALID_BODY", "Unknown sandbox template.", {
              template: templateRaw,
            }),
          );
      }
      /** UUID-based identities avoid same-millisecond collisions (parallel clicks → duplicate email → CONFLICT). */
      const email = `sandbox-${randomUUID()}@aproof.test`;
      const password = `sandbox_pw_${randomUUID()}`;

      const signUpResult = await signUp(db, {
        email,
        password,
        organization_name: String(body?.organization_name ?? "Sandbox Org"),
      });
      if (!signUpResult.ok) {
        request.log.warn({ sandbox: true, code: signUpResult.code }, "sandbox sign-up failed");
        return reply
          .status(500)
          .send(apiErrorEnvelope("SANDBOX_INIT_FAILED", "Sandbox initialization failed."));
      }

      await updateEnvironmentMode(db, {
        environmentId: signUpResult.environment_id,
        organizationId: signUpResult.organization_id,
        mode: "testnet",
      });
      await updateEnvironmentName(db, {
        environmentId: signUpResult.environment_id,
        organizationId: signUpResult.organization_id,
        name: "testnet",
      });

      let bootstrap: Awaited<ReturnType<typeof runSandboxScenario>> | undefined;
      if (template) {
        try {
          bootstrap = await runSandboxScenario(db, {
            organizationId: signUpResult.organization_id,
            environmentId: signUpResult.environment_id,
            template,
          });
        } catch (err) {
          request.log.warn({ err, sandbox: true, template }, "sandbox scenario bootstrap failed");
          return reply
            .status(500)
            .send(apiErrorEnvelope("SANDBOX_BOOTSTRAP_FAILED", "Sandbox scenario seed failed."));
        }
      }

      /**
       * Reuse the session row created by `signUp` for this user/env. It already references the
       * environment we just updated; a second `signIn` was redundant and could fail if `signIn`'s
       * environment pick (`limit(1)`) ever diverged from the signup env.
       */
      reply.header("set-cookie", buildSessionSetCookieHeader(signUpResult.session_token));

      request.log.info({
        audit: true,
        action: "sandbox.session_create",
        user_id: signUpResult.user_id,
        organization_id: signUpResult.organization_id,
        environment_id: signUpResult.environment_id,
        template: template ?? null,
      });

      return reply.status(201).send(
        buildSandboxSessionSuccessBody({
          user_id: signUpResult.user_id,
          organization_id: signUpResult.organization_id,
          environment_id: signUpResult.environment_id,
          expires_at: signUpResult.expires_at,
          ...(bootstrap ? { bootstrap } : {}),
        }),
      );
    } catch (err) {
      request.log.warn({ err, sandbox: true }, "sandbox session threw");
      return reply
        .status(500)
        .send(apiErrorEnvelope("SANDBOX_INIT_FAILED", "Sandbox initialization failed."));
    }
  });

  app.post("/sandbox/reset", async (request, reply) => {
    try {
      if (!requireDevnetForSandboxDemo(reply)) return;
      const session = await authenticateSession(db, request, reply);
      if (!session) return;

      const env = await getEnvironment(db, {
        environmentId: session.environmentId,
        organizationId: session.organizationId,
      });
      if (!env || env.mode !== "testnet") {
        return reply
          .status(403)
          .send(
            apiErrorEnvelope(
              "FORBIDDEN",
              "Sandbox reset and replay is only available for testnet environments.",
            ),
          );
      }

      const body = request.body as Record<string, unknown> | undefined;
      const templateRaw = body?.template;
      const template =
        typeof templateRaw === "string" && templateRaw.trim().length > 0 ? templateRaw.trim() : "";
      if (!isSandboxScenarioTemplate(template)) {
        return reply
          .status(400)
          .send(apiErrorEnvelope("INVALID_BODY", "A valid sandbox template is required for replay."));
      }

      const demoActionRaw = body?.demo_action;
      const demoRailRaw = body?.demo_rail;
      const hasTargeted =
        demoActionRaw !== undefined && demoActionRaw !== null && String(demoActionRaw).trim() !== "";

      let bootstrap: Awaited<ReturnType<typeof runSandboxScenario>>;
      try {
        if (hasTargeted) {
          const demo_action = String(demoActionRaw).trim();
          if (!isDemoSandboxAction(demo_action)) {
            return reply
              .status(400)
              .send(
                apiErrorEnvelope("INVALID_BODY", "demo_action must be clean_proof, failure, or version_update."),
              );
          }
          if (template !== "demo_all_rails") {
            return reply
              .status(400)
              .send(
                apiErrorEnvelope(
                  "INVALID_BODY",
                  "Targeted demo replay requires template demo_all_rails.",
                ),
              );
          }
          const railStr = typeof demoRailRaw === "string" ? demoRailRaw.trim() : "";
          if (!railStr || !(RAIL_TYPES as readonly string[]).includes(railStr)) {
            return reply
              .status(400)
              .send(apiErrorEnvelope("INVALID_BODY", "demo_rail must be a valid rail type."));
          }
          const demo_rail = railStr as RailType;
          bootstrap = await runSandboxScenario(db, {
            organizationId: session.organizationId,
            environmentId: session.environmentId,
            template: "demo_all_rails",
            targeted: { rail: demo_rail, demo_action },
          });
        } else {
          await clearEnvironmentGeneratedState(db, {
            organizationId: session.organizationId,
            environmentId: session.environmentId,
          });

          const subjectRows = await db
            .select({ id: subjects.id, railType: subjects.railType })
            .from(subjects)
            .where(
              and(
                eq(subjects.organizationId, session.organizationId),
                eq(subjects.environmentId, session.environmentId),
              ),
            );

          if (subjectRows.length > 0) {
            for (const row of subjectRows) {
              await applySandboxRailBaselineShapes(db, {
                organizationId: session.organizationId,
                environmentId: session.environmentId,
                subjectId: row.id,
                rail: row.railType as RailType,
              });
            }
            const subject_ids_by_rail: Record<string, string> = {};
            for (const row of subjectRows) {
              subject_ids_by_rail[row.railType] = row.id;
            }
            bootstrap = {
              template,
              primary_subject_id: subject_ids_by_rail.model ?? subjectRows[0]!.id,
              subject_ids: subjectRows.map((r) => r.id),
              subject_ids_by_rail,
            };
          } else {
            await deleteEnvironmentSubjectGraph(db, {
              organizationId: session.organizationId,
              environmentId: session.environmentId,
            });
            bootstrap = await runSandboxScenario(db, {
              organizationId: session.organizationId,
              environmentId: session.environmentId,
              template,
            });
          }

          demoStateCache.delete(`${session.organizationId}:${session.environmentId}`);
        }
      } catch (err) {
        request.log.warn({ err, sandbox: true, template }, "sandbox replay failed");
        return reply
          .status(500)
          .send(apiErrorEnvelope("SANDBOX_BOOTSTRAP_FAILED", "Sandbox replay seed failed."));
      }

      request.log.info({
        audit: true,
        action: "sandbox.reset_replay",
        organization_id: session.organizationId,
        environment_id: session.environmentId,
        template,
        demo_targeted: hasTargeted,
        demo_rail: hasTargeted ? String(demoRailRaw ?? "").trim() : null,
        demo_action: hasTargeted ? String(demoActionRaw ?? "").trim() : null,
      });

      return reply.status(200).send({
        ok: true,
        sandbox: true,
        ...bootstrap,
      });
    } catch (err) {
      request.log.warn({ err, sandbox: true }, "sandbox reset threw");
      return reply.status(500).send(apiErrorEnvelope("SANDBOX_RESET_FAILED", "Sandbox reset failed."));
    }
  });

  /* ── GET /sandbox/demo-state ── unified demo hydration endpoint ──── */

  app.get("/sandbox/demo-state", async (request, reply) => {
    try {
      if (!requireDevnetForSandboxDemo(reply)) return;
      const session = await authenticateSession(db, request, reply);
      if (!session) return;

      const cacheKey = `${session.organizationId}:${session.environmentId}`;
      const cached = demoStateCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return reply.status(200).send(cached.data);
      }

      const env = await getEnvironment(db, {
        environmentId: session.environmentId,
        organizationId: session.organizationId,
      });

      const subjectsByRail: Record<string, unknown> = {};
      const overviews: Record<string, unknown> = {};

      for (const rail of DEMO_SUBJECT_RAIL_ORDER) {
        const subjectId = demoSandboxSubjectId(session.environmentId, rail);
        const overview = await buildSubjectOverview(db, {
          subjectId,
          organizationId: session.organizationId,
          environmentId: session.environmentId,
          environmentName: session.environmentName ?? env?.name ?? "sandbox",
        });
        if (overview) {
          subjectsByRail[rail] = { subject_id: subjectId, rail };
          overviews[rail] = overview;
        }
      }

      const responseData = {
        ok: true,
        sandbox: true,
        session: {
          organization_id: session.organizationId,
          environment_id: session.environmentId,
          environment_name: session.environmentName ?? env?.name ?? "sandbox",
        },
        subjects_by_rail: subjectsByRail,
        overviews,
      };

      demoStateCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 3000 });

      return reply.status(200).send(responseData);
    } catch (err) {
      request.log.warn({ err, sandbox: true }, "sandbox demo-state threw");
      return reply.status(500).send(apiErrorEnvelope("SANDBOX_DEMO_STATE_FAILED", "Failed to build demo state."));
    }
  });

  return app;
}

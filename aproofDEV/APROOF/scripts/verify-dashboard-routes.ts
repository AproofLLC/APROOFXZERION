/**
 * Smoke-test dashboard/auth HTTP routes against the current PGlite on-disk DB.
 * Run after `npm run dev:db:reset` with the API stopped (script opens the DB exclusively).
 *
 * Usage: npm run dev:verify:routes
 */
import "dotenv/config";
import { getResolvedPgliteDataDirectory, openPgliteDb, pgliteResetCliBlockedReason } from "../src/db/pglite.js";
import { buildServer } from "../src/http/server.js";

function failRoute(step: string, expected: string, gotStatus: number, payload?: string): never {
  console.error(`[verify] FAIL — ${step}`);
  console.error(`[verify] Expected ${expected}; got HTTP ${gotStatus}.`);
  if (payload) console.error(`[verify] Response body (truncated): ${payload.slice(0, 800)}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const blocked = pgliteResetCliBlockedReason();
  if (blocked) {
    console.error("[verify] dev:verify:routes only runs against file-backed PGlite.");
    console.error(`[verify] ${blocked}`);
    console.error("[verify] See APROOF/docs/DEV-DB-RESET.md.");
    process.exit(1);
  }

  const { absolutePath, source } = getResolvedPgliteDataDirectory();
  console.log(`[verify] PGlite directory (${source}): ${absolutePath}`);

  const { client, db } = await openPgliteDb(absolutePath);
  const app = buildServer(db);
  try {
    console.log("[verify] 1. GET /auth/session (unauthenticated) …");
    let r = await app.inject({ method: "GET", url: "/auth/session" });
    if (r.statusCode !== 200) failRoute("GET /auth/session (unauthenticated)", "200", r.statusCode, r.payload);
    const anon = JSON.parse(r.payload) as { authenticated?: boolean };
    if (anon.authenticated !== false) {
      failRoute("GET /auth/session (unauthenticated)", "{ authenticated: false }", r.statusCode, r.payload);
    }

    const email = `route-verify-${Date.now()}@aproof.test`;
    console.log("[verify] 2. POST /auth/sign-up (sign-up flow) …");
    r = await app.inject({
      method: "POST",
      url: "/auth/sign-up",
      headers: { "content-type": "application/json" },
      payload: {
        email,
        password: "secure_password_1",
        organization_name: "Route Verify Org",
      },
    });
    if (r.statusCode !== 201) failRoute("POST /auth/sign-up", "201", r.statusCode, r.payload);

    const setCookie = r.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const sessionCookie = cookieStr!.split(";")[0];

    console.log("[verify] 3. GET /auth/session (authenticated) …");
    r = await app.inject({ method: "GET", url: "/auth/session", headers: { cookie: sessionCookie } });
    if (r.statusCode !== 200) failRoute("GET /auth/session (with session cookie)", "200", r.statusCode, r.payload);

    console.log("[verify] 4. POST /subjects …");
    r = await app.inject({
      method: "POST",
      url: "/subjects",
      headers: { cookie: sessionCookie, "content-type": "application/json" },
      payload: { subject_type: "service" },
    });
    if (r.statusCode !== 201) failRoute("POST /subjects", "201", r.statusCode, r.payload);
    const sid = JSON.parse(r.payload).subject_id as string;

    console.log("[verify] 5. GET /subjects …");
    r = await app.inject({
      method: "GET",
      url: "/subjects?limit=20&offset=0",
      headers: { cookie: sessionCookie },
    });
    if (r.statusCode !== 200) failRoute("GET /subjects", "200", r.statusCode, r.payload);

    console.log("[verify] 6. GET /subjects/:id/overview …");
    r = await app.inject({
      method: "GET",
      url: `/subjects/${sid}/overview`,
      headers: { cookie: sessionCookie },
    });
    if (r.statusCode !== 200) failRoute("GET /subjects/:id/overview", "200", r.statusCode, r.payload);

    console.log("[verify] 7. GET /subjects/:id/zerion-agent-summary …");
    r = await app.inject({
      method: "GET",
      url: `/subjects/${sid}/zerion-agent-summary`,
      headers: { cookie: sessionCookie },
    });
    if (r.statusCode !== 200) {
      failRoute("GET /subjects/:id/zerion-agent-summary", "200", r.statusCode, r.payload);
    }
    const za = JSON.parse(r.payload) as { transactions?: unknown };
    if (!Array.isArray(za.transactions)) {
      failRoute("GET /subjects/:id/zerion-agent-summary", "transactions[]", r.statusCode, r.payload);
    }

    console.log("[verify] 8. POST /auth/sign-out …");
    r = await app.inject({
      method: "POST",
      url: "/auth/sign-out",
      headers: { cookie: sessionCookie, "content-type": "application/json" },
      payload: {},
    });
    if (r.statusCode !== 200) failRoute("POST /auth/sign-out", "200", r.statusCode, r.payload);

    console.log(
      "[verify] PASS — all checks succeeded (session unauthenticated → sign-up → session → subjects → overview → zerion-agent-summary → sign-out)."
    );
  } finally {
    await app.close();
    await client.close();
  }
}

main().catch((e) => {
  console.error("[verify] Unexpected error:", e);
  process.exit(1);
});

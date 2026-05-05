#!/usr/bin/env node
/**
 * Local control-plane + read-model stress pass (real HTTP, no mocks).
 * Usage (from APROOF/):  node scripts/stress-api-load.mjs
 * Env:
 *   STRESS_BASE_URL   default http://127.0.0.1:3000
 *   STRESS_ROUNDS     default 25   (sequential multi-get cycles)
 *   STRESS_CONCURRENCY default 15  (parallel in-flight per burst)
 */
/* eslint-disable no-console */

const BASE = (process.env.STRESS_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ROUNDS = Math.max(1, Number(process.env.STRESS_ROUNDS ?? "25") || 25);
const CONCURRENCY = Math.max(1, Number(process.env.STRESS_CONCURRENCY ?? "15") || 15);

/** @type {Map<number, number>} */
const statusHistogram = new Map();
/** @type {number[]} */
const latenciesMs = [];

function bump(code) {
  statusHistogram.set(code, (statusHistogram.get(code) ?? 0) + 1);
}

function extractSessionCookie(res) {
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  if (list.length) {
    for (const line of list) {
      const m = line.match(/^aproof_session=([^;]+)/);
      if (m) return m[1];
    }
  }
  const single = res.headers.get("set-cookie");
  if (single) {
    const m = single.match(/aproof_session=([^;]+)/);
    if (m) return m[1];
  }
  return null;
}

async function request(path, init = {}) {
  const t0 = performance.now();
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`fetch ${path} failed: ${msg} (is the backend running at ${BASE}?)`);
  }
  const ms = performance.now() - t0;
  latenciesMs.push(ms);
  bump(res.status);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body, ms };
}

async function burst(tasks) {
  const results = [];
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const chunk = tasks.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(chunk.map((fn) => fn()))));
  }
  return results;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`[stress] BASE=${BASE} ROUNDS=${ROUNDS} CONCURRENCY=${CONCURRENCY}`);

  const email = `stress-${Date.now()}@aproof.test`;
  const password = "stress_pw_123456";

  // --- Health (no auth) ---
  {
    const { res, body } = await request("/health");
    assert(res.status === 200, `/health expected 200, got ${res.status} ${JSON.stringify(body)}`);
  }

  // --- Unauthenticated session (200 + body, not 401, to avoid noisy browser fetch failures) ---
  {
    const { res, body } = await request("/auth/session");
    assert(res.status === 200, `/auth/session without cookie expected 200, got ${res.status}`);
    assert(body?.authenticated === false, `/auth/session without cookie expected { authenticated: false }`);
  }

  // --- Sign up ---
  let cookieHeader;
  {
    const { res, body } = await request("/auth/sign-up", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        organization_name: `Stress Org ${Date.now()}`,
      }),
    });
    assert(res.status === 201, `sign-up expected 201, got ${res.status} ${JSON.stringify(body)}`);
    const token = extractSessionCookie(res);
    assert(token, "sign-up missing aproof_session cookie");
    cookieHeader = `aproof_session=${token}`;
  }

  // --- Session restore ---
  let subjectId;
  {
    const { res, body } = await request("/auth/session", {
      headers: { Cookie: cookieHeader },
    });
    assert(res.status === 200, `session expected 200, got ${res.status}`);
    assert(body && body.user_id, "session body missing user_id");
  }

  // --- Create subject ---
  {
    const { res, body } = await request("/subjects", {
      method: "POST",
      headers: { Cookie: cookieHeader },
      body: JSON.stringify({ subject_type: "service" }),
    });
    assert(res.status === 201, `POST /subjects expected 201, got ${res.status}`);
    subjectId = body?.subject_id;
    assert(subjectId, "POST /subjects missing subject_id");
  }

  // --- Invalid credentials ---
  {
    const { res } = await request("/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email, password: "wrong_password_xyz" }),
    });
    assert(res.status === 401, `bad password sign-in expected 401, got ${res.status}`);
  }

  // --- Invalid UUID paths ---
  {
    const bad = "not-a-uuid";
    const paths = [
      `/subjects/${bad}`,
      `/subjects/${bad}/overview`,
      `/subjects/${bad}/proofs`,
      `/proofs/${bad}`,
    ];
    for (const p of paths) {
      const { res } = await request(p, { headers: { Cookie: cookieHeader } });
      assert(res.status === 400, `${p} expected 400 for bad uuid, got ${res.status}`);
    }
  }

  // --- Wrong-org subject 404 (use random uuid) ---
  {
    const fake = "00000000-0000-4000-8000-000000000001";
    const { res } = await request(`/subjects/${fake}`, { headers: { Cookie: cookieHeader } });
    assert(res.status === 404, `GET unknown subject expected 404, got ${res.status}`);
  }

  // --- Overview contract: 7 angles, metadata object ---
  {
    const { res, body } = await request(`/subjects/${subjectId}/overview`, {
      headers: { Cookie: cookieHeader },
    });
    assert(res.status === 200, `overview expected 200, got ${res.status}`);
    assert(Array.isArray(body?.angles_summary), "angles_summary must be array");
    assert(body.angles_summary.length === 7, `angles_summary must have 7 entries, got ${body.angles_summary.length}`);
    assert(body.metadata !== null && typeof body.metadata === "object", "metadata must be non-null object");
    assert(
      typeof body.status_strip?.lineage_count === "number",
      "status_strip.lineage_count must be number",
    );
  }

  // --- Baselines: 7 entries ---
  {
    const { res, body } = await request(`/subjects/${subjectId}/baselines`, {
      headers: { Cookie: cookieHeader },
    });
    assert(res.status === 200, `baselines expected 200, got ${res.status}`);
    assert(Array.isArray(body?.baselines), "baselines must be array");
    assert(body.baselines.length === 7, `baselines must be 7, got ${body.baselines.length}`);
  }

  // --- Proofs list (empty ok) ---
  {
    const { res, body } = await request(`/subjects/${subjectId}/proofs?limit=10&offset=0`, {
      headers: { Cookie: cookieHeader, "x-proof-view": "internal" },
    });
    assert(res.status === 200, `proofs list expected 200, got ${res.status}`);
    assert(Array.isArray(body?.items), "proofs items must be array");
    assert(body.page && typeof body.page.total === "number", "proofs page meta missing");
  }

  // --- Burst + rounds: read endpoints under session ---
  const readFns = () => [
    () => request("/auth/session", { headers: { Cookie: cookieHeader } }),
    () => request("/subjects?limit=50&offset=0", { headers: { Cookie: cookieHeader } }),
    () => request(`/subjects/${subjectId}/overview`, { headers: { Cookie: cookieHeader } }),
    () =>
      request(`/subjects/${subjectId}/proofs?limit=20&offset=0`, {
        headers: { Cookie: cookieHeader, "x-proof-view": "internal" },
      }),
    () => request(`/subjects/${subjectId}/events?limit=20&offset=0`, { headers: { Cookie: cookieHeader } }),
    () => request(`/subjects/${subjectId}/failures?limit=20&offset=0`, { headers: { Cookie: cookieHeader } }),
    () => request(`/subjects/${subjectId}/lineages?limit=20&offset=0`, { headers: { Cookie: cookieHeader } }),
    () => request(`/subjects/${subjectId}/baselines`, { headers: { Cookie: cookieHeader } }),
    () => request("/settings/api", { headers: { Cookie: cookieHeader } }),
    () => request("/settings/account", { headers: { Cookie: cookieHeader } }),
    () => request("/settings/organization", { headers: { Cookie: cookieHeader } }),
    () => request("/settings/organization/users", { headers: { Cookie: cookieHeader } }),
    () => request("/settings/environment", { headers: { Cookie: cookieHeader } }),
  ];

  for (let r = 0; r < ROUNDS; r++) {
    const tasks = [];
    for (let c = 0; c < CONCURRENCY; c++) {
      for (const fn of readFns()) {
        tasks.push(fn);
      }
    }
    await burst(tasks);
  }

  // --- Sign out ---
  {
    const { res } = await request("/auth/sign-out", {
      method: "POST",
      headers: { Cookie: cookieHeader },
      body: JSON.stringify({}),
    });
    assert(res.status === 200, `sign-out expected 200, got ${res.status}`);
  }

  {
    const { res, body } = await request("/auth/session", { headers: { Cookie: cookieHeader } });
    assert(res.status === 200, `session after sign-out expected 200, got ${res.status}`);
    assert(body?.authenticated === false, "session after sign-out expected { authenticated: false }");
  }

  // --- Report ---
  latenciesMs.sort((a, b) => a - b);
  const n = latenciesMs.length;
  const p50 = latenciesMs[Math.floor(n * 0.5)] ?? 0;
  const p95 = latenciesMs[Math.floor(n * 0.95)] ?? 0;
  const sum = latenciesMs.reduce((a, b) => a + b, 0);

  console.log("\n[stress] STATUS HISTOGRAM");
  for (const [code, count] of [...statusHistogram.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${code}: ${count}`);
  }
  console.log("\n[stress] LATENCY (ms) all requests in run");
  console.log(`  count=${n} avg=${n ? (sum / n).toFixed(2) : 0} p50=${p50.toFixed(2)} p95=${p95.toFixed(2)} max=${latenciesMs[n - 1]?.toFixed(2) ?? 0}`);

  const bad = [...statusHistogram.keys()].filter((c) => c >= 500);
  if (bad.length) {
    console.error("[stress] FAIL: saw 5xx codes:", bad.join(", "));
    process.exit(1);
  }

  console.log("\n[stress] PASS");
}

main().catch((e) => {
  console.error("[stress] FAIL", e);
  process.exit(1);
});

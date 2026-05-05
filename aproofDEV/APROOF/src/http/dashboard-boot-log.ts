import type { FastifyRequest } from "fastify";

export type DashboardBootCtx = {
  organization_id?: string;
  environment_id?: string;
  subject_id?: string;
};

/** Structured logs for control-plane dashboard boot paths (session, subjects, overview, settings reads). */
export function logDashboardBootSuccess(
  request: FastifyRequest,
  route: string,
  ctx: DashboardBootCtx,
): void {
  request.log.info({ dashboard_boot: true, route, outcome: "success", ...ctx });
}

export function logDashboardBootExpectedDenial(
  request: FastifyRequest,
  route: string,
  reason: string,
  ctx?: DashboardBootCtx,
): void {
  request.log.info({ dashboard_boot: true, route, outcome: "expected_denial", reason, ...ctx });
}

export function logDashboardBootFailure(
  request: FastifyRequest,
  route: string,
  err: unknown,
  ctx?: DashboardBootCtx,
): void {
  const stack = err instanceof Error ? err.stack : undefined;
  request.log.error(
    { err, stack, dashboard_boot: true, route, outcome: "failure", ...ctx },
    `${route} failed`,
  );
}

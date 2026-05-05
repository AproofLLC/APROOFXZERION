import type { SubjectOverview } from "../../../api/types";
import { getSandboxScenarioLabel } from "../../../constants/sandbox-scenarios";
import { userFacingSubjectType } from "../../../constants/subject-type-display";
import { useIntegrationBootstrap } from "../../../hooks/useIntegrationBootstrap";
import { useIntegrationStatus } from "../../../hooks/useIntegrationStatus";
import { useOverview } from "../../../hooks/useOverview";
import { useSession } from "../../../hooks/useSession";
import { useUserLogSummary } from "../../../hooks/useUserLogSummary";
import { subjectPrimaryLabel } from "../../../util/subject-display";
import { QuerySectionError } from "../QuerySectionError";
import { LoadingState } from "../ui/loading-state";
import { FirstProofOnboarding } from "./FirstProofOnboarding";
import { IntegrationStatusStrip } from "./IntegrationStatusStrip";
import { NativeIngestPanel } from "./NativeIngestPanel";
import { Button } from "../ui/button";
import { TruthRow, TruthSection, truthNotOnResponse, truthScalar } from "./truth-display";
import { normalizeAnchorMetadataFromApi, shortHash } from "../../../api/anchor-metadata";

/**
 * GET /subjects/:id/overview — only explicitly mapped fields (no inference, no extra sections).
 */
export function ProofsOverview({
  subjectId,
  demoMode = false,
  sandboxTemplateId = null,
  onOpenProofsTab,
  onOpenUserLogsTab,
}: {
  subjectId: string;
  demoMode?: boolean;
  /** Current sandbox template id (session storage), passed from shell. */
  sandboxTemplateId?: string | null;
  onOpenProofsTab: () => void;
  onOpenUserLogsTab: () => void;
}) {
  const q = useOverview(subjectId);
  const sessionQ = useSession();
  const userLogsSummaryQ = useUserLogSummary(subjectId);
  const intQ = useIntegrationStatus(subjectId);
  const bootQ = useIntegrationBootstrap(subjectId);

  if (q.isLoading) {
    return <LoadingState message="Loading overview…" />;
  }
  if (q.error) {
    return <QuerySectionError error={q.error as Error} title="Overview unavailable" />;
  }
  const o = q.data;
  if (!o) {
    return <QuerySectionError error={new Error("Empty response")} title="Overview unavailable" />;
  }

  const h = o.subject_header;
  const strip = o.status_strip;
  const snap = o.latest_proof_snapshot;
  const boot = bootQ.data;

  return (
    <div className="max-w-3xl space-y-6">
      <OverviewHero
        h={h}
        snap={snap}
        anglesSummary={o.angles_summary}
        eventCount={o.event_count ?? strip.total_events}
        proofEventCount={o.proof_event_count ?? strip.total_events}
        angleResultCount={o.angle_result_count ?? strip.total_proofs}
        failureCount={o.failure_count ?? strip.active_failures}
        isTestnet={sessionQ.data?.environment_mode === "testnet"}
        sandboxStoryId={sandboxTemplateId}
        demoMode={demoMode}
      />

      {!demoMode ? <FirstProofOnboarding subjectId={subjectId} onViewProof={onOpenProofsTab} /> : null}

      {!demoMode ? (
        <UserLogsOverviewCard summaryQ={userLogsSummaryQ} onOpenUserLogs={onOpenUserLogsTab} />
      ) : null}

      {!demoMode ? <IntegrationStatusStrip s={intQ.data} loading={intQ.isLoading} /> : null}
      {!demoMode && intQ.data?.anchor_readout?.latest_batch ? (
        (() => {
          const meta = normalizeAnchorMetadataFromApi(intQ.data.anchor_readout.latest_batch.anchor_metadata);
          return (
        <section className="rounded-xl border border-border bg-card p-4 space-y-2 text-xs">
          <h2 className="text-sm font-medium">Latest Solana anchor</h2>
          <TruthRow label="Network" value={truthScalar(meta.network ?? "Not anchored yet")} />
          <TruthRow label="Root hash" value={truthScalar(meta.root_hash)} />
          <TruthRow
            label="Transaction signature"
            value={truthScalar(meta.tx_signature ? shortHash(meta.tx_signature) : "No Solana transaction")}
          />
          <TruthRow
            label="Explorer URL"
            value={
              meta.explorer_url ? (
                <a
                  className="underline"
                  href={meta.explorer_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Solana Explorer
                </a>
              ) : (
                "Not anchored yet"
              )
            }
          />
          <TruthRow label="Wallet public key" value={truthScalar(meta.wallet_public_key ? shortHash(meta.wallet_public_key) : null)} />
          <TruthRow label="Confirmation status" value={truthScalar(meta.confirmation_status)} />
          <TruthRow label="Anchored timestamp" value={truthScalar(meta.anchored_at)} />
          <TruthRow label="Proof count" value={truthScalar(meta.proof_count)} />
        </section>
          );
        })()
      ) : null}

      {!demoMode && boot && !bootQ.isLoading && !bootQ.error ? (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-medium">Send a test event</h2>
          <p className="text-xs text-muted-foreground">
            Same contract as production. Paste an API key from Settings if needed.
          </p>
          <NativeIngestPanel
            compact
            organizationId={boot.organization_id}
            environmentId={boot.environment_id}
            subjectId={boot.subject_id}
            defaultSourceTypeKey={boot.source_type_key}
            defaultPayload={boot.starter_payload}
          />
        </section>
      ) : !demoMode && bootQ.isLoading ? (
        <LoadingState message="Loading ingest template…" />
      ) : null}

      {!demoMode ? (
        <>
          <TruthSection title="Full snapshot (same fields as the API)">
            <OverviewFieldRows h={h} strip={strip} snap={snap} />
          </TruthSection>
          <p className="text-xs text-muted-foreground">
            Rows mirror <code className="font-mono">subject_header</code>, <code className="font-mono">status_strip</code>
            , and <code className="font-mono">latest_proof_snapshot</code>.
          </p>
        </>
      ) : null}
    </div>
  );
}

function OverviewHero({
  h,
  snap,
  anglesSummary,
  eventCount,
  proofEventCount,
  angleResultCount,
  failureCount,
  isTestnet,
  sandboxStoryId,
  demoMode,
}: {
  h: SubjectOverview["subject_header"];
  snap: SubjectOverview["latest_proof_snapshot"];
  anglesSummary: SubjectOverview["angles_summary"];
  eventCount: number;
  proofEventCount: number;
  angleResultCount: number;
  failureCount: number;
  isTestnet?: boolean;
  sandboxStoryId: string | null;
  demoMode?: boolean;
}) {
  const name = subjectPrimaryLabel(h);
  const hasEvents = eventCount > 0;
  const latestProofLabel =
    hasEvents && snap.status != null && snap.status !== "" ? truthScalar(snap.status) : "Not evaluated";
  return (
    <section className="rounded-xl border border-border bg-gradient-to-br from-card to-muted/30 p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">At a glance</p>
          <h2 className="text-lg font-semibold leading-tight">{name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Type: <span className="text-foreground">{userFacingSubjectType(h.subject_type)}</span>
          </p>
          {isTestnet && sandboxStoryId ? (
            <p className="text-xs text-muted-foreground mt-2 max-w-[min(100%,28rem)] leading-relaxed border-l-2 border-primary/30 pl-3">
              {demoMode ? "Guided scenario: " : "Scenario: "}
              <strong className="text-foreground">{getSandboxScenarioLabel(sandboxStoryId)}</strong>.
              {demoMode ? " Live sandbox data from your session." : " Seeded via the API."}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Latest proof status</p>
          <p className="text-base font-semibold tabular-nums">{latestProofLabel}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center sm:text-left">
        <HeroStat
          label="Anchor"
          value={hasEvents && snap.anchor_status != null && snap.anchor_status !== "" ? truthScalar(snap.anchor_status) : "—"}
        />
        <HeroStat label="Events" value={truthScalar(eventCount)} />
        <HeroStat label="Proof Events" value={truthScalar(proofEventCount)} />
        <HeroStat label="Angle Results" value={truthScalar(angleResultCount)} />
        <HeroStat
          label="Failures"
          value={
            !hasEvents ? "—" : failureCount === 0 ? "No failures detected" : truthScalar(failureCount)
          }
        />
      </div>
      {hasEvents && anglesSummary?.length ? (
        <div className="pt-2 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground mb-2">Angles summary</p>
          <ul className="flex flex-wrap gap-2">
            {anglesSummary.slice(0, 7).map((a, i) => (
              <li
                key={`${a.angle}-${a.reason_code}-${i}`}
                className="text-xs rounded-md border border-border bg-background/80 px-2 py-1 font-mono"
              >
                {a.angle}: <span className="text-muted-foreground">{a.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function UserLogsOverviewCard({
  summaryQ,
  onOpenUserLogs,
}: {
  summaryQ: ReturnType<typeof useUserLogSummary>;
  onOpenUserLogs: () => void;
}) {
  if (summaryQ.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        Loading user log summary…
      </section>
    );
  }
  if (summaryQ.isError || !summaryQ.data) return null;
  const s = summaryQ.data;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-medium">User logs</h2>
      <p className="text-xs text-muted-foreground">
        Ingested activity inside this subject (separate from proof-generating events).
      </p>
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Total logs</div>
          <div className="font-semibold tabular-nums">{s.total_logs}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Latest activity</div>
          <div className="font-medium leading-snug">{s.latest_activity.action_title ?? "—"}</div>
          {s.latest_activity.source ? (
            <div className="text-xs text-muted-foreground">Source · {s.latest_activity.source}</div>
          ) : null}
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onOpenUserLogs}>
        Open User Logs
      </Button>
    </section>
  );
}

function OverviewFieldRows({
  h,
  strip,
  snap,
}: {
  h: SubjectOverview["subject_header"];
  strip: SubjectOverview["status_strip"];
  snap: SubjectOverview["latest_proof_snapshot"];
}) {
  return (
    <>
      <TruthRow label="subject_id" value={truthScalar(h.subject_id)} />
      <TruthRow label="subject_type" value={truthScalar(h.subject_type)} />
      <TruthRow label="latest_proof_id" value={truthScalar(snap.proof_id)} />
      <TruthRow label="latest_proof_status" value={truthScalar(snap.status)} />
      <TruthRow label="total_proofs" value={truthScalar(strip.total_proofs)} />
      <TruthRow label="failure_count" value={truthScalar(strip.active_failures)} />
      <TruthRow label="flagged_count" value={truthScalar(snap.flags)} />
      <TruthRow label="anchor_status" value={truthScalar(snap.anchor_status)} />
      <TruthRow label="baseline_status" value={truthNotOnResponse()} />
      <TruthRow label="last_updated_at" value={truthNotOnResponse()} />
    </>
  );
}

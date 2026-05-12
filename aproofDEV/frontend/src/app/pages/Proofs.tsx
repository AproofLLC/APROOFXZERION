import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { Subject } from "../../api/types";
import { DEMO_ENTRY_TEMPLATE } from "../../constants/demo-curated";
import { DEMO_RAIL_OPTIONS } from "../../constants/demo-rails";
import { useDemoShellOrchestration } from "../../hooks/useDemoShellOrchestration";
import { useCreateSubject } from "../../hooks/useCreateSubject";
import { useOverview } from "../../hooks/useOverview";
import { devHealthUserMessage, isDevApiUnavailable, useDevBackendHealth } from "../../hooks/useDevBackendHealth";
import { getProductMode } from "../../hooks/product-mode";
import { SESSION_SANDBOX_TEMPLATE_KEY } from "../../constants/storage-keys";
import { useSandboxSession } from "../../hooks/useSandboxSession";
import { useSession } from "../../hooks/useSession";
import { useSignIn } from "../../hooks/useSignIn";
import { useSignOut } from "../../hooks/useSignOut";
import { useSignUp } from "../../hooks/useSignUp";
import { useSubjectsList } from "../../hooks/useSubjectsList";
import { readPreferredSandboxSubjectId, readSandboxSubjectIdsByRail } from "../../util/sandbox-bootstrap-storage";
import { DemoControls } from "../components/proofs/DemoControls";
import { DemoScenarioOutcome } from "../components/proofs/DemoScenarioOutcome";
import {
  DemoSubjectPerspectiveSelect,
  type DemoRailSubjectMap,
} from "../components/proofs/DemoSubjectPerspectiveSelect";
import { ProofsAngles } from "../components/proofs/ProofsAngles";
import { ProofsEvents } from "../components/proofs/ProofsEvents";
import { ProofsFailures } from "../components/proofs/ProofsFailures";
import { ProofsOverview } from "../components/proofs/ProofsOverview";
import { ProofsProofs } from "../components/proofs/ProofsProofs";
import { ProofsSettings } from "../components/proofs/ProofsSettings";
import { ProofsTraceability } from "../components/proofs/ProofsTraceability";
import { ProofsUserLogs } from "../components/proofs/ProofsUserLogs";
import { ZerionAgentPanel } from "../components/proofs/ZerionAgentPanel";
import {
  USER_CREATABLE_SUBJECT_TYPES,
  userFacingSubjectType,
  type UserCreatableSubjectType,
} from "../../constants/subject-type-display";
import { formatDemoLastActionLine } from "../../util/demo-last-action";
import {
  getDemoOverviewOutcomeCopy,
  getOperationalOnlySixOfSevenCopy,
  outcomeShortLabel,
} from "../../util/demo-proof-outcome";
import { subjectPrimaryLabel } from "../../util/subject-display";
import { truthNotOnResponse, truthScalar } from "../components/proofs/truth-display";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { LoadingState } from "../components/ui/loading-state";
import { Badge } from "../components/ui/badge";

type AccessView = "home" | "signin" | "signup";

export function Proofs() {
  const sessionQ = useSession();
  const subjectsQ = useSubjectsList(100, 0, Boolean(sessionQ.data));
  const [activeTab, setActiveTab] = useState("overview");
  const [subjectId, setSubjectId] = useState<string | null>(null);

  useEffect(() => {
    const items = subjectsQ.data?.items;
    if (!items?.length) {
      setSubjectId(null);
      return;
    }
    const preferred = readPreferredSandboxSubjectId();
    const railMap = readSandboxSubjectIdsByRail();
    setSubjectId((prev) => {
      if (prev && items.some((s) => s.subject_id === prev)) return prev;
      if (preferred && items.some((s) => s.subject_id === preferred)) return preferred;
      if (railMap?.agent && items.some((s) => s.subject_id === railMap.agent)) return railMap.agent;
      return items[0]!.subject_id;
    });
  }, [subjectsQ.data?.items]);

  if (sessionQ.isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
        <LoadingState message="Checking session…" />
      </div>
    );
  }

  if (!sessionQ.data) {
    return <AccessGateway />;
  }

  if (subjectsQ.isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
        <LoadingState message="Loading workspace…" />
      </div>
    );
  }

  if (subjectsQ.error) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-3">
          <p className="text-sm text-destructive">{(subjectsQ.error as Error).message}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void subjectsQ.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const items = subjectsQ.data?.items ?? [];
  if (items.length === 0) {
    return <NoSubjectOnboarding />;
  }

  if (!subjectId) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
        <LoadingState message="Preparing subject…" />
      </div>
    );
  }

  const mode = getProductMode(sessionQ.data);

  return (
    <ProductShell
      subjectId={subjectId}
      subjects={items}
      onSubjectChange={setSubjectId}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      mode={mode}
    />
  );
}

function NoSubjectOnboarding() {
  const create = useCreateSubject();
  const sessionQ = useSession();
  const [subjectType, setSubjectType] = useState<UserCreatableSubjectType>("model");
  const isDemo = sessionQ.data ? getProductMode(sessionQ.data) === "demo" : false;
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center space-y-6 p-8 rounded-xl border border-border bg-card">
        <h1 className="text-xl font-medium">Create your first subject</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A <strong className="text-foreground font-medium">subject</strong> is what Aproof evaluates (for example a{" "}
          <strong className="text-foreground font-medium">model</strong>, service, or agent). Choose a type—we attach
          baselines and ingest rules the same way as production.
        </p>
        {isDemo ? (
          <p className="text-xs text-muted-foreground rounded-md border border-border/80 bg-muted/20 px-3 py-2">
            Demo workspaces usually open with a subject already in place. If you see this screen, use{" "}
            <strong className="text-foreground">Reset Demo</strong> from Demo controls after entering the app, or start a
            new demo from the welcome screen.
          </p>
        ) : null}
        <div className="text-left space-y-2">
          <Label htmlFor="subject_type">Subject type</Label>
          <select
            id="subject_type"
            className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value as UserCreatableSubjectType)}
          >
            {USER_CREATABLE_SUBJECT_TYPES.map((v) => (
              <option key={v} value={v}>
                {userFacingSubjectType(v)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Prefer to explore first? Choose <strong className="text-foreground">Start Demo</strong> on the welcome
            screen.
          </p>
        </div>
        <Button
          className="w-full"
          disabled={create.isPending}
          onClick={() => void create.mutateAsync(subjectType)}
        >
          {create.isPending ? "Creating…" : "Create subject"}
        </Button>
        {create.error && (
          <p className="text-sm text-destructive">{(create.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}

function AccessGateway() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signIn = useSignIn();
  const signUp = useSignUp();
  const sandbox = useSandboxSession();
  const devHealth = useDevBackendHealth();
  const sandboxBlocked = isDevApiUnavailable(devHealth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<AccessView>("home");
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");

  const startDemo = () => {
    setBusy(true);
    setError(null);
    void sandbox
      .mutateAsync({
        organization_name: "Demo workspace",
        template: DEMO_ENTRY_TEMPLATE,
      })
      .then(() => {
        navigate("/app/proofs", { replace: true });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not start demo"))
      .finally(() => setBusy(false));
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 py-24 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-medium mb-2">APROOF X ZERION</h1>
          <p className="text-sm text-muted-foreground">
            Explore the Zerion Agent devnet demo (scoped policy + proofs) or sign in to your own workspace.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {view === "home" ? (
          <div className="space-y-4">
            <Button
              className="w-full h-11 text-base font-medium"
              disabled={busy || sandboxBlocked}
              onClick={() => startDemo()}
            >
              {busy ? "Starting…" : "Start Demo"}
            </Button>
            {sandboxBlocked ? (
              <p className="text-xs text-amber-800 dark:text-amber-200 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                {devHealthUserMessage(devHealth)}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={busy}
                onClick={() => {
                  setView("signin");
                  setError(null);
                }}
              >
                Sign In
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={busy}
                onClick={() => {
                  setView("signup");
                  setError(null);
                }}
              >
                Sign Up
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                disabled={busy}
                onClick={() => void qc.invalidateQueries({ queryKey: ["session"] })}
              >
                Restore session
              </button>
            </p>
          </div>
        ) : null}

        {view === "signin" ? (
          <div className="space-y-4">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground mb-2"
              disabled={busy}
              onClick={() => setView("home")}
            >
              ← Back
            </button>
            <div className="space-y-6 p-6 rounded-xl border border-border bg-card">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="h-10"
                    disabled={busy}
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className="h-10"
                    disabled={busy}
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full h-10"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void signIn
                    .mutateAsync({ email: signInEmail.trim(), password: signInPassword })
                    .then(() => navigate("/app/proofs", { replace: true }))
                    .catch((e) => setError(e instanceof Error ? e.message : "Sign-in failed"))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? "Signing in…" : "Sign In"}
              </Button>
            </div>
          </div>
        ) : null}

        {view === "signup" ? (
          <div className="space-y-4">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground mb-2"
              disabled={busy}
              onClick={() => setView("home")}
            >
              ← Back
            </button>
            <div className="space-y-6 p-6 rounded-xl border border-border bg-card">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="organization">Organization</Label>
                  <Input
                    id="organization"
                    className="h-10"
                    disabled={busy}
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup_email">Email</Label>
                  <Input
                    id="signup_email"
                    type="email"
                    className="h-10"
                    disabled={busy}
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup_password">Password</Label>
                  <Input
                    id="signup_password"
                    type="password"
                    className="h-10"
                    disabled={busy}
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full h-10"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void signUp
                    .mutateAsync({
                      email: signUpEmail.trim(),
                      password: signUpPassword,
                      organization_name: orgName.trim() || "Organization",
                    })
                    .then(() => navigate("/app/proofs", { replace: true }))
                    .catch((e) => setError(e instanceof Error ? e.message : "Sign-up failed"))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? "Creating…" : "Sign Up"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProductShell({
  subjectId,
  subjects,
  onSubjectChange,
  activeTab,
  setActiveTab,
  mode,
}: {
  subjectId: string;
  subjects: Subject[];
  onSubjectChange: (id: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mode: ReturnType<typeof getProductMode>;
}) {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const sessionQ = useSession();
  const overviewQ = useOverview(subjectId);
  const isDemo = mode === "demo";
  const railMap = typeof sessionStorage !== "undefined" ? readSandboxSubjectIdsByRail() : null;
  const multiSubjectDemo =
    isDemo &&
    railMap != null &&
    DEMO_RAIL_OPTIONS.every((o) => typeof railMap[o.rail] === "string") &&
    DEMO_RAIL_OPTIONS.every((o) => subjects.some((s) => s.subject_id === railMap[o.rail]));
  const singleSubjectDemo = isDemo && subjects.length === 1 && !multiSubjectDemo;
  const loneDemoSubject = singleSubjectDemo ? subjects[0] : undefined;

  let sandboxTemplateLabel: string | null = null;
  if (typeof sessionStorage !== "undefined") {
    try {
      sandboxTemplateLabel = sessionStorage.getItem(SESSION_SANDBOX_TEMPLATE_KEY);
    } catch {
      sandboxTemplateLabel = null;
    }
  }

  const sidebarItemsProd = [
    { id: "overview", label: "Overview" },
    { id: "zerion-agent", label: "Zerion Agent" },
    { id: "proofs", label: "Proofs" },
    { id: "events", label: "Events" },
    { id: "traceability", label: "Lineages" },
    { id: "failures", label: "Failures" },
    { id: "angles", label: "Baselines" },
    { id: "user-logs", label: "User Logs" },
    { id: "settings", label: "Settings" },
  ];

  const sidebarItemsDemo = [
    { id: "overview", label: "Overview" },
    { id: "zerion-agent", label: "Zerion Agent" },
    { id: "angles", label: "Baselines" },
    { id: "proofs", label: "Proofs" },
    { id: "events", label: "Events" },
    { id: "failures", label: "Failures" },
    { id: "traceability", label: "Traceability" },
    { id: "user-logs", label: "User Logs" },
    { id: "settings", label: "Settings" },
  ];

  const sidebarItems = isDemo ? sidebarItemsDemo : sidebarItemsProd;

  const selectedSubject = subjects.find((s) => s.subject_id === subjectId);
  const header = overviewQ.data?.subject_header;
  const snap = overviewQ.data?.latest_proof_snapshot;
  const demoRail = selectedSubject?.subject_type?.trim() || "system";

  const [detailPaneNonce, setDetailPaneNonce] = useState(0);
  const bumpDetailPane = useCallback(() => setDetailPaneNonce((n) => n + 1), []);
  const handleSubjectIdChange = useCallback(
    (id: string) => {
      onSubjectChange(id);
      if (isDemo) bumpDetailPane();
    },
    [onSubjectChange, isDemo, bumpDetailPane],
  );

  const [demoOutcomePin, setDemoOutcomePin] = useState<{ status: string | null; line: string } | null>(null);
  useEffect(() => {
    setDemoOutcomePin(null);
  }, [subjectId]);

  const demoOrchestration = useDemoShellOrchestration({
    demoRail,
    subjectId,
    onSubjectChange,
    setActiveTab,
    bumpDetailPane,
    onDemoScenarioResolved: (ov, kind) => {
      setDemoOutcomePin({
        status: ov.latest_proof_snapshot?.status ?? null,
        line: formatDemoLastActionLine(demoRail, kind, ov.latest_proof_snapshot?.status ?? null),
      });
    },
  });

  const stripSnapshotStatus = demoOutcomePin?.status ?? snap?.status;
  const latestZerionTxHash = overviewQ.data?.latest_proof_snapshot?.zerion_tx_hash ?? null;
  const agentAuthorizedIncomplete =
    isDemo &&
    demoRail === "agent" &&
    stripSnapshotStatus === "conformant" &&
    !(typeof latestZerionTxHash === "string" && latestZerionTxHash.trim().length >= 32);
  const demoOperationalReason =
    overviewQ.data?.active_failures_list?.find((f) => f.angle === "operational_integrity")?.reason_code ?? null;
  const latestAnchorSigRaw = overviewQ.data?.status_strip?.latest_anchor_metadata?.tx_signature;
  const latestAnchorSig =
    typeof latestAnchorSigRaw === "string" && latestAnchorSigRaw.trim().length >= 32 ? latestAnchorSigRaw.trim() : null;
  const demoSixOfSevenLine = getOperationalOnlySixOfSevenCopy(overviewQ.data?.angles_summary);
  const latestProofStatusLabel = overviewQ.isError
    ? truthNotOnResponse()
    : agentAuthorizedIncomplete
      ? "incomplete"
      : stripSnapshotStatus != null && stripSnapshotStatus !== ""
        ? outcomeShortLabel(stripSnapshotStatus)
        : "not evaluated";

  const createRealWorkspace = () => {
    signOut.mutate(undefined, {
      onSuccess: () => {
        navigate("/app/proofs", { replace: true });
        toast.message("Signed out", { description: "Create a workspace to use production mode." });
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {isDemo ? (
        <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Badge variant="secondary" className="font-normal shrink-0">
              Demo Mode
            </Badge>
            <span className="text-muted-foreground">
              Zerion Agent · Solana devnet · AProof proof layer — guided experience
            </span>
          </div>
          <button
            type="button"
            className="text-primary font-medium hover:underline shrink-0"
            onClick={() => createRealWorkspace()}
          >
            Create real workspace
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 border-r border-border bg-sidebar p-6 space-y-2 shrink-0">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                activeTab === item.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {multiSubjectDemo && railMap ? (
            <div className="shrink-0 border-b border-border bg-muted/25 px-4 sm:px-8 py-3">
              <DemoSubjectPerspectiveSelect
                railMap={railMap as DemoRailSubjectMap}
                subjectId={subjectId}
                onSubjectChange={handleSubjectIdChange}
              />
            </div>
          ) : null}

          <div className="border-b border-border bg-card px-4 sm:px-8 py-4 shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {!isDemo || !multiSubjectDemo ? (
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                      Subject
                    </span>
                  ) : null}
                  {loneDemoSubject ? (
                    <span className="font-medium text-base sm:text-lg truncate">
                      {subjectPrimaryLabel(loneDemoSubject)}
                    </span>
                  ) : multiSubjectDemo ? (
                    <span className="font-medium text-base sm:text-lg truncate">
                      {selectedSubject ? subjectPrimaryLabel(selectedSubject) : "—"}
                    </span>
                  ) : (
                    <select
                      className="font-medium text-base sm:text-lg bg-transparent border border-border rounded-md px-2 py-1 max-w-[min(100%,320px)] truncate"
                      value={subjectId}
                      onChange={(e) => handleSubjectIdChange(e.target.value)}
                      aria-label="Active subject"
                    >
                      {subjects.map((s) => (
                        <option key={s.subject_id} value={s.subject_id}>
                          {subjectPrimaryLabel(s)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal text-xs">
                    {overviewQ.isError
                      ? "—"
                      : userFacingSubjectType(header?.subject_type) ?? (overviewQ.isLoading ? "…" : "—")}
                  </Badge>
                  <span className="text-muted-foreground text-xs hidden sm:inline">·</span>
                  <span className="text-xs text-muted-foreground">
                    {sessionQ.data
                      ? `${sessionQ.data.environment} (${sessionQ.data.environment_mode})`
                      : sessionQ.isLoading
                        ? "…"
                        : "—"}
                  </span>
                </div>
                {!isDemo ? (
                  <details className="text-xs group">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none [&::-webkit-details-marker]:hidden">
                      <span className="underline-offset-2 group-open:underline">Identifiers &amp; API fields</span>
                    </summary>
                    <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground border border-border/60 rounded-md p-2 bg-muted/20">
                      <div>subject_id: {truthScalar(selectedSubject?.subject_id)}</div>
                      <div>external_key: {truthScalar(selectedSubject?.external_key)}</div>
                      <div>subject_type (list): {truthScalar(selectedSubject?.subject_type)}</div>
                    </div>
                  </details>
                ) : null}
              </div>
              <div className="flex flex-col sm:items-end gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground mb-0.5">Latest proof</div>
                  <div className="text-sm font-semibold tabular-nums capitalize">{latestProofStatusLabel}</div>
                  {overviewQ.isError ? (
                    <div className="text-[11px] text-muted-foreground mt-1">Proof id: {truthNotOnResponse()}</div>
                  ) : snap?.proof_id != null && snap.proof_id !== "" ? (
                    <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[220px] mt-1">
                      {snap.proof_id}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground mt-1">No proof yet</div>
                  )}
                  {isDemo && !overviewQ.isError && stripSnapshotStatus ? (
                    <p className="text-[10px] text-muted-foreground mt-2 max-w-[260px] ml-auto text-right leading-snug">
                      {getDemoOverviewOutcomeCopy(
                        demoRail,
                        stripSnapshotStatus,
                        demoOperationalReason,
                        latestZerionTxHash,
                        latestAnchorSig,
                      )}
                      {demoSixOfSevenLine ? ` ${demoSixOfSevenLine}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={signOut.isPending}
                    onClick={() =>
                      signOut.mutate(undefined, {
                        onSuccess: () => navigate("/app/proofs", { replace: true }),
                        onError: (e: Error) => toast.error(e.message),
                      })
                    }
                  >
                    {signOut.isPending ? "Signing out…" : "Sign out"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-8 flex-1 min-h-0 overflow-y-auto" key={subjectId}>
            {isDemo && demoOrchestration.orchestrationHint ? (
              <div
                className="mb-4 flex items-center gap-2 text-xs text-muted-foreground border border-border/70 bg-muted/25 rounded-md px-3 py-2.5"
                role="status"
                aria-live="polite"
              >
                <span
                  className="inline-block size-3.5 shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
                <span>{demoOrchestration.orchestrationHint}</span>
              </div>
            ) : null}
            {isDemo ? (
              <div
                className={`mb-4 transition-opacity ${demoOrchestration.orchestrationHint ? "opacity-40 pointer-events-none" : ""}`}
              >
                <DemoScenarioOutcome
                  snapshotStatus={stripSnapshotStatus}
                  lastActionLine={demoOutcomePin?.line ?? null}
                />
              </div>
            ) : null}
            {isDemo ? (
              <div className="mb-6">
                <DemoControls
                  demoRail={demoRail}
                  runTargeted={(a, m, k) => void demoOrchestration.runTargeted(a, m, k)}
                  runFullReset={() => void demoOrchestration.runFullReset()}
                  busy={demoOrchestration.busy}
                  pendingKey={demoOrchestration.pendingKey}
                />
              </div>
            ) : null}

            {activeTab === "overview" && (
              <ProofsOverview
                subjectId={subjectId}
                demoMode={isDemo}
                sandboxTemplateId={sandboxTemplateLabel}
                onOpenProofsTab={() => setActiveTab("proofs")}
                onOpenUserLogsTab={() => setActiveTab("user-logs")}
              />
            )}
            {activeTab === "zerion-agent" && <ZerionAgentPanel subjectId={subjectId} />}
            {activeTab === "events" && <ProofsEvents subjectId={subjectId} />}
            {activeTab === "traceability" && (
              <ProofsTraceability
                subjectId={subjectId}
                demoMode={isDemo}
                shellResetEpoch={isDemo ? detailPaneNonce : 0}
              />
            )}
            {activeTab === "proofs" && (
              <ProofsProofs
                subjectId={subjectId}
                shellResetEpoch={isDemo ? detailPaneNonce : 0}
                demoMode={isDemo}
                demoRail={demoRail}
              />
            )}
            {activeTab === "failures" && (
              <ProofsFailures
                subjectId={subjectId}
                shellResetEpoch={isDemo ? detailPaneNonce : 0}
                demoMode={isDemo}
                demoRail={demoRail}
              />
            )}
            {activeTab === "angles" && (
              <ProofsAngles
                subjectId={subjectId}
                subjectType={subjects.find((s) => s.subject_id === subjectId)?.subject_type ?? ""}
                readOnlyDemo={isDemo}
              />
            )}
            {activeTab === "user-logs" && <ProofsUserLogs subjectId={subjectId} />}
            {activeTab === "settings" && <ProofsSettings subjectId={subjectId} />}
          </div>
        </div>
      </div>
    </div>
  );
}

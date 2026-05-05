import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "../../../api/client";
import { SESSION_PENDING_PROOF_ID_KEY } from "../../../constants/storage-keys";
import { useApiKeys } from "../../../hooks/useApiKeys";
import { useIntegrationBootstrap } from "../../../hooks/useIntegrationBootstrap";
import { useOverview } from "../../../hooks/useOverview";
import { subjectPrimaryLabel } from "../../../util/subject-display";
import { userFacingSubjectType } from "../../../constants/subject-type-display";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { LoadingState } from "../ui/loading-state";
import { NativeIngestPanel } from "./NativeIngestPanel";

type CreateApiKeyResult = {
  id: string;
  name: string;
  key_prefix: string;
  plain_key: string;
  created_at: string;
};

export function FirstProofOnboarding({
  subjectId,
  onViewProof,
}: {
  subjectId: string;
  onViewProof: () => void;
}) {
  const qc = useQueryClient();
  const overviewQ = useOverview(subjectId);
  const bootQ = useIntegrationBootstrap(subjectId);
  const keysQ = useApiKeys();
  const [newKeyName, setNewKeyName] = useState("first-proof");
  const [plainKey, setPlainKey] = useState<string | null>(null);
  const [ingestOutcome, setIngestOutcome] = useState<"idle" | "success" | "error">("idle");
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  const createKey = useMutation({
    mutationFn: (name: string) =>
      apiFetch<CreateApiKeyResult>("/settings/api-keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["settings", "api"] });
      setPlainKey(res.plain_key);
      toast.success("API key created — copy it now; it will not be shown again.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const header = overviewQ.data?.subject_header;
  const totalProofs = overviewQ.data?.status_strip?.total_proofs ?? 0;
  const showWizard = totalProofs === 0;

  const subjectLabel = useMemo(() => {
    if (!header) return subjectId;
    return subjectPrimaryLabel(header);
  }, [header, subjectId]);

  if (!showWizard) return null;

  if (overviewQ.isLoading || bootQ.isLoading) {
    return <LoadingState message="Preparing first proof…" />;
  }
  if (bootQ.error || overviewQ.error) {
    return <p className="text-sm text-destructive">{((bootQ.error ?? overviewQ.error) as Error).message}</p>;
  }
  if (!bootQ.data || !header) return null;

  const b = bootQ.data;
  const keys = keysQ.data ?? [];

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4 sm:p-6 space-y-6 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Create your first proof</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Confirm context, create an API key, send one test event, then open the proof in the Proofs tab.
          </p>
        </div>
        {ingestOutcome === "success" ? (
          <Badge>Success</Badge>
        ) : ingestOutcome === "error" ? (
          <Badge variant="destructive">Needs attention</Badge>
        ) : null}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">1 · Subject context</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">
          <div>
            <dt className="text-muted-foreground">Subject name</dt>
            <dd>{subjectLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Subject type</dt>
            <dd>{userFacingSubjectType(b.subject_type)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Subject ID</dt>
            <dd className="break-all">{b.subject_id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Organization ID</dt>
            <dd className="break-all">{b.organization_id}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Environment ID</dt>
            <dd className="break-all">{b.environment_id}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">2 · API key</h3>
        {keys.length > 0 ? (
          <ul className="text-xs font-mono space-y-1 text-muted-foreground">
            {keys.map((k) => (
              <li key={k.id}>
                {k.name} · prefix {k.key_prefix} {k.revoked ? "(revoked)" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No keys yet for this environment.</p>
        )}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label htmlFor="fp-key-name" className="text-xs">
              Key name
            </Label>
            <Input
              id="fp-key-name"
              className="h-9 font-mono text-xs w-48"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={createKey.isPending}
            onClick={() => void createKey.mutateAsync(newKeyName.trim() || "first-proof")}
          >
            {createKey.isPending ? "…" : "Generate API key"}
          </Button>
        </div>
        {plainKey ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Copy this secret once</p>
            <pre className="text-[11px] font-mono break-all whitespace-pre-wrap">{plainKey}</pre>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(plainKey).then(() => toast.message("Copied API key"))}
            >
              Copy API key
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">3 · Starter event</h3>
        <p className="text-xs text-muted-foreground">
          Default <code className="font-mono">{b.source_type_key}</code> — you can edit JSON before sending.
        </p>
        <NativeIngestPanel
          organizationId={b.organization_id}
          environmentId={b.environment_id}
          subjectId={b.subject_id}
          defaultSourceTypeKey={b.source_type_key}
          defaultPayload={b.starter_payload}
          initialApiKey={plainKey ?? ""}
          onIngestError={() => setIngestOutcome("error")}
          onIngestSuccess={(body) => {
            const pp = body.product_proof;
            const eventId =
              typeof body.event_id === "string"
                ? body.event_id
                : pp && typeof pp === "object" && typeof pp.event_id === "string"
                  ? pp.event_id
                  : null;
            if (eventId) setLastEventId(eventId);
            setIngestOutcome("success");
            void qc.invalidateQueries({ queryKey: ["subjects", subjectId, "overview"] });
            void qc.invalidateQueries({ queryKey: ["proofs", subjectId] });
          }}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">4 · Result</h3>
        {ingestOutcome === "success" && lastEventId ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              Event ID: <code className="font-mono text-xs break-all">{lastEventId}</code>
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                try {
                  sessionStorage.setItem(SESSION_PENDING_PROOF_ID_KEY, lastEventId);
                } catch {
                  /* ignore */
                }
                onViewProof();
              }}
            >
              View proof
            </Button>
          </div>
        ) : ingestOutcome === "success" ? (
          <p className="text-sm text-muted-foreground">
            Ingest succeeded but no <code className="font-mono text-xs">event_id</code> was found. Check the last
            response JSON above.
          </p>
        ) : ingestOutcome === "error" ? (
          <p className="text-sm text-muted-foreground">
            Fix the payload or mapping, add an API key if needed, then <strong>Send test event</strong> again.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Send a test event to create your first proof.</p>
        )}
      </section>
    </div>
  );
}

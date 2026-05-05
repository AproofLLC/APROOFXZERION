import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { resolveRequestUrl } from "../../../api/client";
import { SESSION_LAST_INGEST_RESULT_KEY } from "../../../constants/storage-keys";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

export type NativeIngestPanelProps = {
  organizationId: string;
  environmentId: string;
  subjectId: string;
  defaultSourceTypeKey: string;
  defaultPayload: Record<string, unknown>;
  initialApiKey?: string;
  compact?: boolean;
  onIngestSuccess?: (body: { event_id?: string; product_proof?: { proof_id?: string; event_id?: string } }) => void;
  onIngestError?: () => void;
};

function loadPersistedResult(): string | null {
  try {
    return sessionStorage.getItem(SESSION_LAST_INGEST_RESULT_KEY);
  } catch {
    return null;
  }
}

function persistResult(json: string) {
  try {
    sessionStorage.setItem(SESSION_LAST_INGEST_RESULT_KEY, json);
  } catch {
    /* ignore */
  }
}

export function NativeIngestPanel({
  organizationId,
  environmentId,
  subjectId,
  defaultSourceTypeKey,
  defaultPayload,
  initialApiKey = "",
  compact,
  onIngestSuccess,
  onIngestError,
}: NativeIngestPanelProps) {
  const [sourceTypeKey, setSourceTypeKey] = useState(defaultSourceTypeKey);
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(defaultPayload, null, 2));
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [busy, setBusy] = useState(false);
  const [lastResponse, setLastResponse] = useState<string | null>(() => loadPersistedResult());

  useEffect(() => {
    setSourceTypeKey(defaultSourceTypeKey);
  }, [defaultSourceTypeKey]);

  useEffect(() => {
    setPayloadText(JSON.stringify(defaultPayload, null, 2));
  }, [defaultPayload]);

  useEffect(() => {
    if (initialApiKey) setApiKey(initialApiKey);
  }, [initialApiKey]);

  const curlExample = useMemo(() => {
    let payloadObj: Record<string, unknown> = {};
    try {
      payloadObj = JSON.parse(payloadText) as Record<string, unknown>;
    } catch {
      payloadObj = {};
    }
    const body = {
      organization_id: organizationId,
      environment_id: environmentId,
      source_type_key: sourceTypeKey,
      subject_id: subjectId,
      event_lineage_id: crypto.randomUUID(),
      event_version: 1,
      trace_id: "trace-from-curl",
      occurred_at: new Date().toISOString(),
      payload: payloadObj,
    };
    const json = JSON.stringify(body);
    const escaped = json.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const base = resolveRequestUrl("/events");
    return `curl -sS -X POST "${base}" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "x-proof-view: internal" \\\n  -d "${escaped}"`;
  }, [organizationId, environmentId, subjectId, sourceTypeKey, payloadText]);

  const nodeExample = useMemo(() => {
    let payloadObj: Record<string, unknown> = {};
    try {
      payloadObj = JSON.parse(payloadText) as Record<string, unknown>;
    } catch {
      payloadObj = {};
    }
    return `const body = ${JSON.stringify(
      {
        organization_id: organizationId,
        environment_id: environmentId,
        source_type_key: sourceTypeKey,
        subject_id: subjectId,
        event_lineage_id: crypto.randomUUID(),
        event_version: 1,
        trace_id: "trace-from-node",
        occurred_at: new Date().toISOString(),
        payload: payloadObj,
      },
      null,
      2,
    )};\n\nconst res = await fetch(${JSON.stringify(resolveRequestUrl("/events"))}, {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    "x-api-key": process.env.APROOF_API_KEY!,\n    "x-proof-view": "internal",\n  },\n  body: JSON.stringify(body),\n});\nconsole.log(await res.json());`;
  }, [organizationId, environmentId, subjectId, sourceTypeKey, payloadText]);

  const send = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.error("Add an API key (Settings → Generate API Key).");
      return;
    }
    let payloadObj: Record<string, unknown>;
    try {
      payloadObj = JSON.parse(payloadText) as Record<string, unknown>;
      if (payloadObj === null || typeof payloadObj !== "object" || Array.isArray(payloadObj)) {
        throw new Error("Payload must be a JSON object.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid JSON payload.");
      return;
    }

    const body = {
      organization_id: organizationId,
      environment_id: environmentId,
      source_type_key: sourceTypeKey,
      subject_id: subjectId,
      event_lineage_id: crypto.randomUUID(),
      event_version: 1,
      trace_id: `ui-${crypto.randomUUID()}`,
      occurred_at: new Date().toISOString(),
      payload: payloadObj,
    };

    setBusy(true);
    try {
      const res = await fetch(resolveRequestUrl("/events"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey.trim(),
          "x-proof-view": "internal",
        },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      const out = typeof parsed === "object" && parsed !== null ? JSON.stringify(parsed, null, 2) : String(parsed);
      setLastResponse(out);
      persistResult(out);
      if (res.ok) {
        toast.success("Event ingested — proof created.");
        if (typeof parsed === "object" && parsed !== null) {
          onIngestSuccess?.(parsed as { event_id?: string; product_proof?: { proof_id?: string; event_id?: string } });
        }
      } else {
        toast.error(`Ingest failed (HTTP ${res.status})`);
        onIngestError?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      onIngestError?.();
    } finally {
      setBusy(false);
    }
  }, [apiKey, organizationId, environmentId, subjectId, sourceTypeKey, payloadText, onIngestSuccess, onIngestError]);

  return (
    <div className={compact ? "space-y-3" : "space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6"}>
      <div className="space-y-2">
        <Label htmlFor="ingest-source-type">source_type_key</Label>
        <Input
          id="ingest-source-type"
          className="font-mono text-xs"
          value={sourceTypeKey}
          onChange={(e) => setSourceTypeKey(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ingest-api-key">x-api-key</Label>
        <Input
          id="ingest-api-key"
          type="password"
          autoComplete="off"
          className="font-mono text-xs"
          placeholder="Paste plain key from POST /settings/api-keys"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ingest-payload">payload (JSON object)</Label>
        <Textarea
          id="ingest-payload"
          className="font-mono text-xs min-h-[180px]"
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void send()}>
          {busy ? "Sending…" : "Send test event"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void navigator.clipboard.writeText(payloadText).then(() => toast.message("Copied payload JSON"))
          }
        >
          Copy payload
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void navigator.clipboard.writeText(curlExample).then(() => toast.message("Copied curl"))}
        >
          Copy curl
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void navigator.clipboard.writeText(nodeExample).then(() => toast.message("Copied Node example"))}
        >
          Copy Node
        </Button>
      </div>
      {lastResponse ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Last response (persisted in session)</div>
          <pre className="p-3 rounded-lg bg-muted/40 text-[11px] overflow-x-auto max-h-64 overflow-y-auto font-mono">
            {lastResponse}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

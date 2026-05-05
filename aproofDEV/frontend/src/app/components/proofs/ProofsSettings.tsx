/**
 * Settings control plane: every mutation hits the API (source of truth), then
 * `invalidateControlPlaneForSubject` + targeted settings query keys rebind the shell
 * (session, integration status, overview, mappings) so no stale state survives
 * across this page and the rest of the product shell.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiFetch, resolveRequestUrl } from "../../../api/client";
import type { AccountSettings, ApiKeyListItem, EnvironmentSettings, OrganizationSettings } from "../../../api/types";
import { APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY } from "../../../constants/ingest";
import { useAccountSettings } from "../../../hooks/useAccountSettings";
import { useApiKeys } from "../../../hooks/useApiKeys";
import { useEnvironmentSettings } from "../../../hooks/useEnvironmentSettings";
import { useIntegrationBootstrap } from "../../../hooks/useIntegrationBootstrap";
import { useIntegrationStatus } from "../../../hooks/useIntegrationStatus";
import { useOrganizationSettings } from "../../../hooks/useOrganizationSettings";
import { useOrganizationUsers } from "../../../hooks/useOrganizationUsers";
import { useSession } from "../../../hooks/useSession";
import { useSubjectMappings } from "../../../hooks/useSubjectMappings";
import { invalidateControlPlaneForSubject } from "../../../settings/settings-invalidation";
import { AnchoringPanel } from "./settings/AnchoringPanel";
import { SettingsSection } from "./settings/SettingsSection";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { LoadingState } from "../ui/loading-state";
import { Separator } from "../ui/separator";
import { IntegrationStatusStrip } from "./IntegrationStatusStrip";
import { MappingsPanel } from "./MappingsPanel";
import { NativeIngestPanel } from "./NativeIngestPanel";
import { Copy, Key, Trash2 } from "lucide-react";

type CreateApiKeyResult = {
  id: string;
  name: string;
  key_prefix: string;
  plain_key: string;
  created_at: string;
};

function shellDoubleQuotedPayload(json: string): string {
  return json.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function EventIngestionExample({ subjectId }: { subjectId: string }) {
  const sessionQ = useSession();

  const curlBlock = useMemo(() => {
    const session = sessionQ.data;
    if (!session || !subjectId) return null;

    const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "") || "";
    const postUrl = apiBase
      ? `${apiBase}/events`
      : typeof window !== "undefined"
        ? `${window.location.origin}/events`
        : "http://127.0.0.1:5173/events";
    const displayBase = apiBase || (typeof window !== "undefined" ? window.location.origin : "");
    const body = {
      organization_id: session.organization_id,
      environment_id: session.environment_id,
      source_type_key: APROOF_DEFAULT_INGEST_SOURCE_TYPE_KEY,
      subject_id: subjectId,
      event_lineage_id: crypto.randomUUID(),
      event_version: 1,
      trace_id: "ingest-example-1",
      occurred_at: new Date().toISOString(),
      payload: { host: "ingest-client" },
    };
    const json = JSON.stringify(body);
    const escaped = shellDoubleQuotedPayload(json);
    return {
      postUrl,
      displayBase,
      text: `curl -sS -X POST "${postUrl}" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: YOUR_PLAIN_KEY_FROM_API_KEYS" \\\n  -H "x-proof-view: internal" \\\n  -d "${escaped}"`,
    };
  }, [sessionQ.data, subjectId]);

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        Contract: <code className="font-mono text-xs">POST /events</code> with <code className="font-mono text-xs">x-api-key</code>{" "}
        set to a <strong>plain</strong> key from <strong>API keys</strong> (below).{" "}
        <code className="font-mono text-xs">source_type_key</code> should match your active mapping. Request URL matches{" "}
        <code className="font-mono text-xs">{resolveRequestUrl("/events")}</code> in this app (Vite proxy in dev; set{" "}
        <code className="font-mono text-xs">VITE_API_BASE_URL</code> for a fixed host).
      </p>
      <div className="p-6 rounded-xl border border-border bg-card space-y-3">
        {sessionQ.isLoading ? (
          <LoadingState message="Loading session…" />
        ) : !curlBlock ? (
          <p className="text-sm text-muted-foreground">Session and subject are required to build this example.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Effective API base in this build: <span className="font-mono">{curlBlock.displayBase}</span>
            </p>
            <pre className="p-3 rounded-lg bg-muted/30 text-[11px] overflow-x-auto font-mono whitespace-pre-wrap">
              {curlBlock.text}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(curlBlock.text).then(() => toast.message("Copied curl example"))
                }
              >
                Copy curl
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function ProofsSettings({ subjectId }: { subjectId: string }) {
  const qc = useQueryClient();
  const sessionQ = useSession();
  const accountQ = useAccountSettings();
  const orgQ = useOrganizationSettings();
  const usersQ = useOrganizationUsers();
  const envQ = useEnvironmentSettings();
  const keysQ = useApiKeys();
  const intQ = useIntegrationStatus(subjectId);
  const bootQ = useIntegrationBootstrap(subjectId);
  const mapQ = useSubjectMappings(subjectId);

  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [envName, setEnvName] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [lastPlainKey, setLastPlainKey] = useState<string | null>(null);

  useEffect(() => {
    if (accountQ.data?.email) setEmail(accountQ.data.email);
  }, [accountQ.data?.email]);

  useEffect(() => {
    if (envQ.data?.name) setEnvName(envQ.data.name);
  }, [envQ.data?.name]);

  const patchAccount = useMutation({
    mutationFn: (body: { email?: string; current_password?: string; new_password?: string }) =>
      apiFetch<AccountSettings>("/settings/account", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings", "account"] });
      await invalidateControlPlaneForSubject(qc, subjectId, { session: true });
      toast.success("Account updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchEnv = useMutation({
    mutationFn: (body: { mode?: EnvironmentSettings["mode"]; name?: string }) =>
      apiFetch<EnvironmentSettings>("/settings/environment", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings", "environment"] });
      await invalidateControlPlaneForSubject(qc, subjectId, { session: true, subjectsList: true });
      toast.success("Environment updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createKey = useMutation({
    mutationFn: (name: string) =>
      apiFetch<CreateApiKeyResult>("/settings/api-keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["settings", "api"] });
      await invalidateControlPlaneForSubject(qc, subjectId, { subjectsList: true });
      setLastPlainKey(res.plain_key);
      setNewKeyName("");
      toast.success("API key created — copy the secret now; it will not be shown again.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/settings/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings", "api"] });
      await invalidateControlPlaneForSubject(qc, subjectId, { subjectsList: true });
      toast.success("API key revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (accountQ.isLoading || orgQ.isLoading || envQ.isLoading) {
    return <LoadingState message="Loading settings…" />;
  }

  if (accountQ.error || orgQ.error || envQ.error) {
    return (
      <div className="p-6 text-sm text-destructive border border-destructive/30 rounded-xl">
        {[accountQ.error, orgQ.error, envQ.error]
          .filter(Boolean)
          .map((e) => (e as Error).message)
          .join(" ")}
      </div>
    );
  }

  const org = orgQ.data as OrganizationSettings;
  const env = envQ.data as EnvironmentSettings;
  const keys = keysQ.data ?? ([] as ApiKeyListItem[]);
  const currentUserId = sessionQ.data?.user_id;

  return (
    <div className="space-y-12 max-w-4xl pb-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace control plane</h1>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Configure how this subject ingests and maps events, how integrations authenticate, and how the environment
          and anchor layer relate to the rest of Aproof. Changes persist on the server and trigger a full
          control-plane refetch (integration status, overview, session where applicable)—not local-only state.
        </p>
      </div>

      <IntegrationStatusStrip s={intQ.data} loading={intQ.isLoading} />

      <SettingsSection
        id="ingest"
        title="Ingest & routing"
        description="How this subject receives native events, the current ingest contract, and a live test path. Readiness
        below reflects the integration bootstrap payload for this subject and environment."
      >
        {bootQ.data ? (
          <div className="space-y-3">
            {bootQ.data.integration_status ? (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={bootQ.data.integration_status.baselines_ready ? "default" : "secondary"}>
                  Baselines {bootQ.data.integration_status.baselines_ready ? "ready" : "incomplete"}
                </Badge>
                <Badge variant={bootQ.data.integration_status.mapping_ready ? "default" : "secondary"}>
                  Mapping {bootQ.data.integration_status.mapping_ready ? "ready" : "missing"}
                </Badge>
                <Badge variant={bootQ.data.integration_status.api_key_present ? "default" : "secondary"}>
                  API key {bootQ.data.integration_status.api_key_present ? "present" : "missing"}
                </Badge>
              </div>
            ) : null}
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-1">
              <h3 className="text-sm font-medium">Native ingest (UI)</h3>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{bootQ.data.source_type_key}</span> · subject{" "}
                <span className="font-mono">{bootQ.data.subject_id}</span> · type {bootQ.data.subject_type}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <NativeIngestPanel
                compact
                organizationId={bootQ.data.organization_id}
                environmentId={bootQ.data.environment_id}
                subjectId={bootQ.data.subject_id}
                defaultSourceTypeKey={bootQ.data.source_type_key}
                defaultPayload={bootQ.data.starter_payload}
                initialApiKey={lastPlainKey ?? ""}
                onIngestSuccess={() => {
                  void invalidateControlPlaneForSubject(qc, subjectId, { subjectsList: true });
                }}
                onIngestError={() => {
                  void invalidateControlPlaneForSubject(qc, subjectId);
                }}
              />
            </div>
          </div>
        ) : bootQ.isLoading ? (
          <LoadingState message="Loading ingest bootstrap…" />
        ) : (
          <p className="text-sm text-destructive">Could not load integration bootstrap for this subject.</p>
        )}
      </SettingsSection>

      <SettingsSection
        id="mappings"
        title="Mappings"
        description="Source type keys map to canonical event types for this organization and environment. Rules are
        server-managed; editing custom rows is not exposed in the UI yet (read-only list)."
      >
        <MappingsPanel items={mapQ.data?.items} loading={mapQ.isLoading} error={(mapQ.error as Error) ?? null} />
      </SettingsSection>

      <SettingsSection
        id="api-keys"
        title="API keys"
        description="Keys are scoped to the current organization and environment (sandbox vs live framing is the same
        credential system—use separate environments for separation). No last-used metadata is stored in this build."
      >
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          {keysQ.isLoading ? (
            <LoadingState message="Loading keys…" />
          ) : keysQ.error ? (
            <p className="text-sm text-destructive">{(keysQ.error as Error).message}</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-start justify-between p-4 rounded-lg border border-border bg-background/50 gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Key className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{k.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {k.revoked ? "Revoked" : "Active"}
                      </Badge>
                    </div>
                    <code className="font-mono text-sm">{k.key_prefix}…</code>
                    <div className="text-xs text-muted-foreground mt-2">
                      Created {new Date(k.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive shrink-0"
                    disabled={k.revoked || revokeKey.isPending}
                    onClick={() => revokeKey.mutate(k.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {lastPlainKey ? (
            <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
              <div className="text-sm font-medium">New key secret (copy now)</div>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono text-xs break-all flex-1">{lastPlainKey}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void navigator.clipboard.writeText(lastPlainKey).then(() => toast.message("Copied"))}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setLastPlainKey(null)}>
                Dismiss
              </Button>
            </div>
          ) : null}

          <Separator />

          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="key_name">New key name</Label>
              <Input
                id="key_name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. CI / staging"
                className="h-10"
              />
            </div>
            <Button
              type="button"
              disabled={createKey.isPending || !newKeyName.trim()}
              onClick={() => createKey.mutate(newKeyName.trim())}
            >
              {createKey.isPending ? "Creating…" : "Create key"}
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="automation"
        title="Automation & integration"
        description="Hand off from another system with the same JSON contract the UI uses. Base URL is environment-aware
        (Vite dev proxy, or VITE_API_BASE_URL when set)."
      >
        <div className="p-5 rounded-xl border border-dashed border-border/80 bg-muted/10 space-y-4">
          <p className="text-xs text-muted-foreground font-mono">POST {resolveRequestUrl("/events")}</p>
          <EventIngestionExample subjectId={subjectId} />
        </div>
      </SettingsSection>

      <SettingsSection
        id="anchoring"
        title="Anchoring (Solana sandbox route)"
        description="The Solana Sandbox Route (`solana-sandbox`) is the active attestation path: local batches with
        simulated Solana-shaped fields. This is not a public-chain write until a real on-chain attestation is enabled."
      >
        <AnchoringPanel
          readout={intQ.data?.anchor_readout}
          summary={intQ.data?.anchor_state_summary ?? { queued: 0, batched: 0, submitted: 0, confirmed: 0, failed: 0 }}
          loading={intQ.isLoading}
        />
      </SettingsSection>

      <SettingsSection
        id="account"
        title="Account"
        description="Session-backed user for this browser. Email and password changes hit PATCH /settings/account and
        refresh session-dependent views."
      >
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <div className="text-xs text-muted-foreground">
            User ID: <span className="font-mono">{accountQ.data?.user_id}</span> · role{" "}
            <span className="font-mono">{accountQ.data?.role}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="acct_email">Email</Label>
            <Input
              id="acct_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10"
            />
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="text-sm font-medium">Change password</div>
            <div className="space-y-2">
              <Label htmlFor="cur_pw">Current password</Label>
              <Input
                id="cur_pw"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_pw">New password</Label>
              <Input
                id="new_pw"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conf_pw">Confirm new password</Label>
              <Input
                id="conf_pw"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              disabled={patchAccount.isPending || email === accountQ.data?.email}
              onClick={() => patchAccount.mutate({ email: email.trim() })}
            >
              Save email
            </Button>
            <Button
              type="button"
              disabled={
                patchAccount.isPending ||
                !currentPassword ||
                !newPassword ||
                newPassword !== confirmPassword
              }
              onClick={() => patchAccount.mutate({ current_password: currentPassword, new_password: newPassword })}
            >
              Update password
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="organization"
        title="Organization"
        description="Read-only: renaming the organization is not available via API in this build."
      >
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={org.name} readOnly className="h-10 bg-muted/20" />
          </div>
          <div className="space-y-2">
            <Label>Organization ID</Label>
            <Input value={org.organization_id} readOnly className="h-10 font-mono text-sm bg-muted/20" />
          </div>
          <p className="text-xs text-muted-foreground">Created {new Date(org.created_at).toLocaleString()}</p>
        </div>
      </SettingsSection>

      <SettingsSection
        id="team"
        title="Team"
        description="Directory for this organization. Invites, removals, and role changes are not available in the UI
        yet; list is read-only from GET /settings/organization/users."
      >
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          {usersQ.isLoading ? (
            <LoadingState message="Loading users…" />
          ) : usersQ.error ? (
            <p className="text-sm text-destructive">{(usersQ.error as Error).message}</p>
          ) : (usersQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No users returned.</p>
          ) : (
            <div className="space-y-2">
              {(usersQ.data ?? []).map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-background/50 gap-2 flex-wrap"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-medium">{u.email}</div>
                      {currentUserId && u.user_id === currentUserId ? (
                        <Badge variant="default" className="text-[10px] h-5">
                          You
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs font-mono">
                        {u.role}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">{u.user_id}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Joined {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        id="environment"
        title="Environment"
        description="Session environment: `testnet` is the product’s local/sandbox-style mode; it does not select a
        public chain — proof commitments still go through the solana-sandbox route (simulated) in Settings until a
        real on-chain attestation is enabled. Name and mode persist; changing them updates the server and the session read model."
      >
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <div className="space-y-2">
            <Label htmlFor="env_name">Environment name</Label>
            <Input
              id="env_name"
              value={envName}
              onChange={(e) => setEnvName(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-3">
            <Label className="text-sm">Mode</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Product uses <span className="font-mono">testnet</span> for dev/sandbox-style runs; the solana-sandbox
              route label and simulated attestation readout still come from stored batches (not user-selectable here).
            </p>
            <div className="flex gap-2 flex-wrap">
              {(["testnet", "staging", "production"] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={env.mode === m ? "default" : "outline"}
                  size="sm"
                  disabled={patchEnv.isPending}
                  onClick={() => patchEnv.mutate({ mode: m })}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={patchEnv.isPending || !envName.trim() || envName.trim() === env.name}
              onClick={() => patchEnv.mutate({ name: envName.trim() })}
            >
              Save environment name
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="font-mono">Environment ID: {env.environment_id}</div>
            <div>Created {new Date(env.created_at).toLocaleString()}</div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

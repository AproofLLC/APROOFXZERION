import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { SubjectOverview } from "../api/types";

export type DemoStateResponse = {
  ok: boolean;
  sandbox: boolean;
  session: {
    organization_id: string;
    environment_id: string;
    environment_name: string;
  };
  subjects_by_rail: Record<string, { subject_id: string; rail: string }>;
  overviews: Record<string, SubjectOverview>;
};

export function useDemoState(enabled: boolean) {
  return useQuery({
    queryKey: ["demo-state"],
    queryFn: () => apiFetch<DemoStateResponse>("/sandbox/demo-state"),
    enabled,
    staleTime: 3000,
    retry: 1,
    throwOnError: false,
  });
}

/**
 * Seed React Query caches from the unified demo-state response so
 * individual overview/baselines queries resolve instantly.
 */
export function seedQueryCacheFromDemoState(
  qc: ReturnType<typeof useQueryClient>,
  data: DemoStateResponse,
): void {
  for (const [rail, overview] of Object.entries(data.overviews)) {
    const entry = data.subjects_by_rail[rail];
    if (entry) {
      qc.setQueryData(["overview", entry.subject_id], overview);
    }
  }
}

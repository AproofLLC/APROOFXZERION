import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

export type IntegrationBootstrap = {
  organization_id: string;
  environment_id: string;
  subject_id: string;
  subject_type: string;
  source_type_key: string;
  starter_payload: Record<string, unknown>;
  integration_status: {
    baselines_ready: boolean;
    mapping_ready: boolean;
    api_key_present: boolean;
  };
};

export function useIntegrationBootstrap(subjectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["subjects", subjectId, "integration-bootstrap"],
    queryFn: () => apiFetch<IntegrationBootstrap>(`/subjects/${subjectId}/integration-bootstrap`),
    enabled: Boolean(subjectId) && enabled,
  });
}

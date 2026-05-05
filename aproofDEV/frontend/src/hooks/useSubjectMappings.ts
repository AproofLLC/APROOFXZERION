import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";

export type MappingListItem = {
  source_type_key: string;
  canonical_event_type: string;
  is_default: boolean;
  is_active: boolean;
};

export function useSubjectMappings(subjectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["subjects", subjectId, "mappings"],
    queryFn: () => apiFetch<{ items: MappingListItem[] }>(`/subjects/${subjectId}/mappings`),
    enabled: Boolean(subjectId) && enabled,
  });
}

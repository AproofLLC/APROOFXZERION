import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { OrganizationSettings } from "../api/types";

export function useOrganizationSettings() {
  return useQuery({
    queryKey: ["settings", "organization"],
    queryFn: () => apiFetch<OrganizationSettings>("/settings/organization"),
    /** Dashboard shell must not hard-fail if org metadata is temporarily unavailable. */
    throwOnError: false,
    retry: 1,
  });
}

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { EnvironmentSettings } from "../api/types";

export function useEnvironmentSettings() {
  return useQuery({
    queryKey: ["settings", "environment"],
    queryFn: () => apiFetch<EnvironmentSettings>("/settings/environment"),
    throwOnError: false,
    retry: 1,
  });
}

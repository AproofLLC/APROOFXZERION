import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { ApiKeyListItem } from "../api/types";

export function useApiKeys() {
  return useQuery({
    queryKey: ["settings", "api"],
    queryFn: async () => {
      const res = await apiFetch<{ keys: ApiKeyListItem[] }>("/settings/api");
      return res.keys ?? [];
    },
  });
}

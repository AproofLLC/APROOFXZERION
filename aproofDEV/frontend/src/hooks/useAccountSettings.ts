import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { AccountSettings } from "../api/types";

export function useAccountSettings() {
  return useQuery({
    queryKey: ["settings", "account"],
    queryFn: () => apiFetch<AccountSettings>("/settings/account"),
  });
}

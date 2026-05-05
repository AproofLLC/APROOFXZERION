import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { OrgUserRow } from "../api/types";

export function useOrganizationUsers() {
  return useQuery({
    queryKey: ["settings", "organization", "users"],
    queryFn: async () => {
      const res = await apiFetch<{ users: OrgUserRow[] }>("/settings/organization/users");
      return res.users ?? [];
    },
  });
}

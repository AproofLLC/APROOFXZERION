import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../api/client";
import type { Session } from "../api/types";

function isNoSessionBody(data: unknown): data is { authenticated: false } {
  return (
    !!data &&
    typeof data === "object" &&
    "authenticated" in data &&
    (data as { authenticated?: unknown }).authenticated === false
  );
}

export function useSession(enabled = true) {
  return useQuery({
    queryKey: ["session"],
    queryFn: async (): Promise<Session | null> => {
      try {
        const data = await apiFetch<Session | { authenticated: false }>("/auth/session");
        if (isNoSessionBody(data)) return null;
        return data as Session;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    enabled,
    retry: false,
  });
}

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { EventDetail } from "../api/types";

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiFetch<EventDetail>(`/events/${eventId}`),
    enabled: Boolean(eventId),
  });
}

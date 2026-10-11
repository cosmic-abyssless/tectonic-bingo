// Notifications (CONTEXT.md "Notification", "Inbox", "Catch-up"): the viewer's settings and Inbox, the one-time offers,
// and a Bingo's Catch-up. All of it is the viewer's own: nothing here is about anyone else.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CatchUpResponse, NotificationInboxResponse, NotificationOffer, NotificationSettings, NotificationSettingsResponse } from "@bingo/shared";
import { api } from "./client";
import { useAuth } from "../context/AuthContext";

export const notificationKeys = {
  settings: () => ["notificationSettings"] as const,
  inbox: () => ["notificationInbox"] as const,
  catchUp: (slug: string) => ["catchUp", slug] as const,
};

export function useNotificationSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: notificationKeys.settings(),
    queryFn: () => api.get<NotificationSettingsResponse>("/api/me/notifications/settings"),
    enabled: !!user,
    staleTime: 60_000,
  });
}

/** Whether Notifications are on for the viewer (any Level but Off). False until the settings have loaded. */
export function useNotificationsOn(): boolean {
  return (useNotificationSettings().data?.settings.level ?? "off") !== "off";
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Omit<NotificationSettings, "kinds">> & { kinds?: NotificationSettings["kinds"] }) => api.put<NotificationSettingsResponse>("/api/me/notifications/settings", patch),
    onSuccess: (data) => {
      queryClient.setQueryData(notificationKeys.settings(), data);
      void queryClient.invalidateQueries({ queryKey: ["catchUp"] });
    },
  });
}

/** The Mod panel's one-time line, Keep them: Notifications at + Browser with only Submissions waiting. */
export function useKeepModAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<NotificationSettingsResponse>("/api/me/notifications/keep-mod-alerts"),
    onSuccess: (data) => queryClient.setQueryData(notificationKeys.settings(), data),
  });
}

/** Try again: a test DM, which clears "Can't reach you on Discord" if it goes. */
export function useDiscordTestDm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<NotificationSettingsResponse & { ok: boolean; message: string }>("/api/me/notifications/discord-test"),
    onSuccess: ({ ok: _ok, message: _message, ...data }) => queryClient.setQueryData(notificationKeys.settings(), data),
  });
}

export function useInbox(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.inbox(),
    queryFn: () => api.get<NotificationInboxResponse>("/api/me/notifications"),
    enabled,
  });
}

/** Opening the Inbox marks everything in it read. */
export function useMarkInboxRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<NotificationInboxResponse>("/api/me/notifications/read"),
    onSuccess: (data) => queryClient.setQueryData(notificationKeys.inbox(), data),
  });
}

/** Empties the Inbox. */
export function useClearInbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<NotificationInboxResponse>("/api/me/notifications"),
    onSuccess: (data) => queryClient.setQueryData(notificationKeys.inbox(), data),
  });
}

/** The Mod panel's Submissions tab is open: the viewer's Notifications about this Bingo's queue are seen. */
export function markModQueueRead(bingoId: string): Promise<NotificationInboxResponse> {
  return api.post<NotificationInboxResponse>("/api/me/notifications/read-mod-queue", { bingoId });
}

export function claimOffer(bingoId: string, offer: NotificationOffer): Promise<{ show: boolean }> {
  return api.post<{ show: boolean }>("/api/me/notifications/offers/claim", { bingoId, offer });
}

export function useAnswerOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { bingoId: string; offer: NotificationOffer; accepted: boolean }) => api.post<NotificationSettingsResponse>("/api/me/notifications/offers/answer", body),
    onSuccess: (data) => {
      queryClient.setQueryData(notificationKeys.settings(), data);
      void queryClient.invalidateQueries({ queryKey: ["catchUp"] });
    },
  });
}

export function useCatchUp(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.catchUp(slug ?? ""),
    queryFn: () => api.get<CatchUpResponse>(`/api/bingos/${slug}/catch-up`),
    enabled: !!slug && enabled,
    // Built for the moment the page opened: refetching it as things happen would only grow a card about the past.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useDismissCatchUp(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/api/bingos/${slug}/catch-up/dismiss`),
    onMutate: () => {
      queryClient.setQueryData<CatchUpResponse>(notificationKeys.catchUp(slug), (old) => (old ? { ...old, since: null, summary: null, sections: [] } : old));
    },
  });
}

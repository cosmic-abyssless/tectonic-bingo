import { useQueryClient } from "@tanstack/react-query";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import type { NotificationEntry, NotificationInboxResponse } from "@bingo/shared";
import { api } from "../../api/client";
import { notificationKeys } from "../../api/notificationsApi";
import { useNotificationMessages } from "../../context/WebSocketContext";
import { toast } from "../ui/Toast";

// The kinds the Board already shows as they happen (the Tile animating complete): no toast on top while it's open.
const SHOWN_ON_BOARD = new Set<NotificationEntry["kind"]>(["team_tile_completed", "team_part_completed"]);

/** Whether the page open now already shows what `entry` is about. */
export function pageShows(entry: NotificationEntry, pathname: string): boolean {
  if (!SHOWN_ON_BOARD.has(entry.kind) || !entry.link) return false;
  const board = matchPath("/b/:slug", pathname)?.params.slug;
  const linked = matchPath("/b/:slug", entry.link.split("?")[0]!)?.params.slug;
  return !!board && board === linked;
}

/**
 * Shows each new Notification (CONTEXT.md "Notification") the way the server said to, for this tab: a toast while it's
 * in view, a browser notification while it's hidden in a browser that allowed them (the + Browser step: the only place
 * the app makes one), or nothing but the Inbox's count. Renders nothing.
 */
export function NotificationDelivery() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  useNotificationMessages((msg) => {
    void (async () => {
      const inbox = await queryClient.fetchQuery({ queryKey: notificationKeys.inbox(), queryFn: () => api.get<NotificationInboxResponse>("/api/me/notifications"), staleTime: 0 });
      if (msg.deliver === "none") return;
      const entries = inbox.notifications.filter((n) => msg.ids.includes(n.id) && !n.readAt).reverse();
      for (const entry of entries) {
        if (msg.deliver === "toast") {
          if (document.visibilityState !== "visible" || pageShows(entry, location.pathname)) continue;
          toast({ title: entry.title, description: entry.body ?? undefined, action: entry.link ? { label: "Open", onPress: () => navigate(entry.link!) } : undefined });
        } else if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
          // The tag keeps two tabs of one browser from showing it twice.
          const shown = new Notification(entry.title, { body: entry.body ?? undefined, tag: entry.id });
          shown.onclick = () => {
            window.focus();
            if (entry.link) navigate(entry.link);
            shown.close();
          };
        }
      }
    })();
  });
  return null;
}

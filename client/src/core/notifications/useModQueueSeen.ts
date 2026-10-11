import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { NotificationKind } from "@bingo/shared";
import { markModQueueRead, notificationKeys, useInbox, useNotificationsOn } from "../../api/notificationsApi";
import { usePageFocused } from "../achievements/usePageFocused";

const MOD_QUEUE_KINDS = new Set<NotificationKind>(["submissions_waiting", "queue_waiting_long"]);

/**
 * While the Mod panel's Submissions tab is open and in view, the viewer's Notifications about this Bingo's queue are
 * seen: marks them read, both those already in the Inbox and any arriving while they look.
 */
export function useModQueueSeen(bingoId: string | undefined, active: boolean): void {
  const on = useNotificationsOn();
  const { data } = useInbox(on);
  const focused = usePageFocused();
  const queryClient = useQueryClient();
  const unseen = !!bingoId && !!data?.notifications.some((n) => !n.readAt && n.bingoId === bingoId && MOD_QUEUE_KINDS.has(n.kind));
  useEffect(() => {
    if (!active || !focused || !unseen || !bingoId) return;
    void markModQueueRead(bingoId).then((inbox) => queryClient.setQueryData(notificationKeys.inbox(), inbox));
  }, [active, focused, unseen, bingoId, queryClient]);
}

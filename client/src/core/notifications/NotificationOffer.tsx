import { useEffect, useRef, useState, type ReactNode } from "react";
import type { NotificationOffer as Offer } from "@bingo/shared";
import { claimOffer, useAnswerOffer } from "../../api/notificationsApi";
import { Button, IconButton } from "../ui/Button";
import { BellIcon, XIcon } from "../ui/icons";

/**
 * One of the one-time offers to turn Notifications on: a single dismissible line in the page, never a
 * dialog and never the browser's prompt. The server decides whether it shows (at most one offer per user per Bingo, and
 * never again once dismissed); `when` is the page's own condition (a first Submission, a Captain with the order set).
 * Turn on sets Notifications to In the app with the kinds they had.
 */
export function NotificationOffer({ bingoId, offer, when = true, children, acceptLabel = "Turn on", onAccepted }: { bingoId: string | undefined; offer: Offer; when?: boolean; children: ReactNode; acceptLabel?: string; onAccepted?: () => void }) {
  const [show, setShow] = useState(false);
  const asked = useRef<string | null>(null);
  const answer = useAnswerOffer();
  useEffect(() => {
    if (!bingoId || !when || asked.current === `${bingoId}:${offer}`) return;
    asked.current = `${bingoId}:${offer}`;
    claimOffer(bingoId, offer)
      .then((r) => setShow(r.show))
      .catch(() => setShow(false));
  }, [bingoId, offer, when]);
  if (!show || !bingoId) return null;
  const respond = (accepted: boolean) => {
    setShow(false);
    answer.mutate({ bingoId, offer, accepted }, { onSuccess: () => accepted && onAccepted?.() });
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-outline bg-surface-raised px-3 py-2 text-sm text-on-surface">
      <BellIcon className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1">{children}</span>
      <span className="flex items-center gap-1">
        <Button size="sm" variant="primary" onPress={() => respond(true)}>
          {acceptLabel}
        </Button>
        <Button size="sm" variant="ghost" onPress={() => respond(false)}>
          No thanks
        </Button>
        <IconButton label="Dismiss" size="sm" onPress={() => respond(false)}>
          <XIcon />
        </IconButton>
      </span>
    </div>
  );
}

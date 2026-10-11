import { useState } from "react";
import { Dialog as AriaDialog, DialogTrigger, Popover } from "react-aria-components";
import { Link, useNavigate } from "react-router-dom";
import { NOTIFICATION_CATALOGUE, type NotificationEntry } from "@bingo/shared";
import { useClearInbox, useInbox, useMarkInboxRead, useNotificationsOn, useUpdateNotificationSettings } from "../../api/notificationsApi";
import { Button, IconButton } from "../ui/Button";
import { Menu, MenuItem, MenuTrigger } from "../ui/Menu";
import { BellIcon, MoreIcon } from "../ui/icons";
import { TextTooltip } from "../ui/Tooltip";
import { timeAgo } from "../ui/time";
import { toast } from "../ui/Toast";

export const NOTIFICATION_SETTINGS_PATH = "/settings/notifications";

function InboxRow({ entry, onOpen }: { entry: NotificationEntry; onOpen: (link: string | null) => void }) {
  const navigate = useNavigate();
  const update = useUpdateNotificationSettings();
  return (
    <li className={`flex items-start gap-2 rounded-md px-2 py-2 ${entry.readAt ? "" : "bg-accent/5"}`}>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(entry.link)}>
        <span className="flex items-baseline gap-2">
          {!entry.readAt && <span aria-label="Unread" className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-accent" />}
          <span className="text-sm font-medium text-on-surface">{entry.title}</span>
        </span>
        {entry.body && <span className="mt-0.5 block text-xs text-on-surface-muted">{entry.body}</span>}
        <span className="mt-0.5 block text-[11px] text-on-surface-subtle">{timeAgo(entry.createdAt)}</span>
      </button>
      <MenuTrigger>
        <IconButton label="More" size="sm">
          <MoreIcon />
        </IconButton>
        <Menu
          onAction={(key) => {
            if (key === "off") {
              update.mutate(
                { kinds: { [entry.kind]: false } },
                { onSuccess: () => toast({ title: `Turned off: ${NOTIFICATION_CATALOGUE[entry.kind].label}`, action: { label: "Settings", onPress: () => navigate(NOTIFICATION_SETTINGS_PATH) } }) },
              );
            }
            if (key === "settings") navigate(NOTIFICATION_SETTINGS_PATH);
          }}
        >
          <MenuItem id="off">Turn off this kind</MenuItem>
          <MenuItem id="settings">Notification settings</MenuItem>
        </Menu>
      </MenuTrigger>
    </li>
  );
}

/**
 * The header's bell (CONTEXT.md "Inbox"), only once the viewer has turned Notifications on: their unread count, and the
 * Inbox behind it. Opening it marks everything read; Clear empties it.
 */
export function InboxButton() {
  const on = useNotificationsOn();
  const { data } = useInbox(on);
  const markRead = useMarkInboxRead();
  const clear = useClearInbox();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!on) return null;
  const unread = data?.unread ?? 0;
  return (
    <DialogTrigger
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Marked read on closing, so the unread ones keep their dot while they're being read.
        if (!next && unread > 0) markRead.mutate();
      }}
    >
      <TextTooltip text="Notifications">
        <IconButton label={unread ? `Notifications, ${unread} unread` : "Notifications"} size="sm" className="relative">
          <BellIcon />
          {unread > 0 && (
            <span className="num absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-on-accent">{unread > 99 ? "99+" : unread}</span>
          )}
        </IconButton>
      </TextTooltip>
      <Popover placement="bottom end" offset={6} className="overlay-panel w-96 max-w-[calc(100vw-2rem)] rounded-md border border-outline bg-surface-raised shadow-pop outline-none">
        <AriaDialog aria-label="Notifications" className="outline-none">
          <div className="flex items-center justify-between border-b border-outline px-3 py-2">
            <span className="text-sm font-semibold text-on-surface">Notifications</span>
            <span className="flex items-center gap-3">
              {data && data.notifications.length > 0 && (
                <button type="button" disabled={clear.isPending} onClick={() => clear.mutate()} className="text-xs text-accent hover:underline disabled:opacity-50">
                  Clear all
                </button>
              )}
              <Link to={NOTIFICATION_SETTINGS_PATH} onClick={() => setOpen(false)} className="text-xs text-accent hover:underline">
                Settings
              </Link>
            </span>
          </div>
          {data && data.notifications.length > 0 ? (
            <ul className="max-h-[min(28rem,70vh)] overflow-y-auto p-1">
              {data.notifications.map((entry) => (
                <InboxRow
                  key={entry.id}
                  entry={entry}
                  onOpen={(link) => {
                    setOpen(false);
                    if (unread > 0) markRead.mutate();
                    if (link) navigate(link);
                  }}
                />
              ))}
            </ul>
          ) : (
            <div className="space-y-2 p-4 text-sm text-on-surface-muted">
              <p>Nothing yet. What you've turned on shows up here as it happens.</p>
              <Button size="sm" variant="secondary" onPress={() => { setOpen(false); navigate(NOTIFICATION_SETTINGS_PATH); }}>
                Choose what you hear about
              </Button>
            </div>
          )}
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}

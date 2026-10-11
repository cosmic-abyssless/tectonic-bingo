import { useState } from "react";
import { useKeepModAlerts } from "../../api/notificationsApi";
import { Button, IconButton } from "../ui/Button";
import { BellIcon, XIcon } from "../ui/icons";

// The Mod panel used to ask for the browser's notification permission by itself (remembered under this key) and raise
// its own alert on every new Submission. That moved to Notifications (CONTEXT.md); a Moderator whose browser had said
// yes is told once.
const OLD_PROMPTED_KEY = "mod_notif_prompted";
const MIGRATED_KEY = "mod_notif_migrated";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function hadOldAlerts(): boolean {
  return !!readStorage(OLD_PROMPTED_KEY) && !readStorage(MIGRATED_KEY) && "Notification" in window && Notification.permission === "granted";
}

/** The one-time "Submission alerts moved to Notifications" line, for a Moderator whose browser had the old alerts on. */
export function ModAlertsMigration() {
  const [show, setShow] = useState(hadOldAlerts);
  const keep = useKeepModAlerts();
  if (!show) return null;
  const done = () => {
    try {
      localStorage.setItem(MIGRATED_KEY, "true");
    } catch {
      // Private mode: it may show once more, which is fine.
    }
    setShow(false);
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-outline bg-surface-raised px-3 py-2 text-sm text-on-surface">
      <BellIcon className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1">Submission alerts moved to Notifications.</span>
      <span className="flex items-center gap-1">
        <Button
          size="sm"
          variant="primary"
          onPress={() => {
            keep.mutate();
            done();
          }}
        >
          Keep them
        </Button>
        <Button size="sm" variant="ghost" onPress={done}>
          Turn off
        </Button>
        <IconButton label="Dismiss" size="sm" onPress={done}>
          <XIcon />
        </IconButton>
      </span>
    </div>
  );
}

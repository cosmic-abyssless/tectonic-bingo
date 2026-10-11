import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_FOLDING_WINDOWS, NOTIFICATION_CATALOGUE, NOTIFICATION_KINDS, type FoldingWindows, type NotificationKind } from "@bingo/shared";
import { api } from "../../api/client";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Input } from "../ui/Field";

const KEY = ["adminNotificationFolding"] as const;

// The kinds a burst of can be folded into one DM: those with a fold in the catalogue.
const FOLDABLE = NOTIFICATION_KINDS.filter((k) => NOTIFICATION_CATALOGUE[k].fold);

/**
 * How long Discord DMs of each kind wait to fold a burst into one (CONTEXT.md "Notification", "Folding"). Only DMs fold:
 * the Inbox, toasts and browser notifications get each one at once. A change applies to the next DM, mid-Bingo too.
 */
export function NotificationFoldingPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: () => api.get<{ windows: FoldingWindows }>("/api/admin/notification-folding") });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (data) setDraft(Object.fromEntries(FOLDABLE.map((k) => [k, String(data.windows[k] ?? 0)])));
  }, [data]);
  const save = useMutation({
    mutationFn: (windows: FoldingWindows) => api.put<{ windows: FoldingWindows }>("/api/admin/notification-folding", windows),
    onSuccess: (res) => queryClient.setQueryData(KEY, res),
  });
  if (!data) return null;

  const submit = () => {
    const windows: FoldingWindows = {};
    for (const kind of FOLDABLE) {
      const minutes = Number(draft[kind]);
      if (draft[kind]?.trim() === "" || !Number.isInteger(minutes) || minutes < 0) {
        setError(`${NOTIFICATION_CATALOGUE[kind].label} must be a whole number of minutes`);
        return;
      }
      windows[kind as NotificationKind] = minutes;
    }
    setError(null);
    save.mutate(windows, { onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save") });
  };

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-on-surface-muted">
        How long a Discord DM waits to fold a burst into one message ("Lynx Titan and 2 others: 4 drops approved"). 0 sends each at once. Only DMs wait: the Inbox,
        toasts and browser notifications get every one as it happens. Other kinds are always sent at once.
      </p>
      <ul className="space-y-2">
        {FOLDABLE.map((kind) => (
          <li key={kind} className="flex items-center justify-between gap-3">
            <span className="text-sm text-on-surface">
              {NOTIFICATION_CATALOGUE[kind].label}
              <span className="ml-2 text-xs text-on-surface-subtle">default {DEFAULT_FOLDING_WINDOWS[kind] ?? 0} min</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-20">
              <Input
                type="number"
                inputMode="numeric"
                size="sm"
                aria-label={`${NOTIFICATION_CATALOGUE[kind].label} window in minutes`}
                value={draft[kind] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [kind]: e.target.value }))}
              />
              </span>
              <span className="text-xs text-on-surface-subtle">min</span>
            </span>
          </li>
        ))}
      </ul>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button variant="primary" onPress={submit} isDisabled={save.isPending}>
        Save
      </Button>
    </div>
  );
}

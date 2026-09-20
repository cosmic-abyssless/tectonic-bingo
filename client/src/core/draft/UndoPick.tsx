import { useState } from "react";
import { Button } from "../ui/Button";

/**
 * Site-admin control for a misclicked draft: takes back the latest pick. It asks first, naming who is about to leave
 * which team, so an accidental press on the button itself doesn't undo the wrong thing.
 */
export function UndoPick({
  pickNumber,
  names,
  teamName,
  busy,
  error,
  onUndo,
}: {
  pickNumber: number;
  names: string[];
  teamName: string;
  busy: boolean;
  error: string | null;
  onUndo: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const who = names.join(" & ");

  async function confirm() {
    if (await onUndo()) setConfirming(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-outline bg-surface px-4 py-2.5" data-testid="undo-pick">
      <p className="min-w-0 text-sm text-on-surface-muted">
        {confirming ? (
          <>
            Take back pick <span className="num">{pickNumber}</span>, <span className="font-medium text-on-surface">{who}</span>, from {teamName}? They go back into the pool and {teamName} is on the clock again.
          </>
        ) : (
          <>
            Latest pick: <span className="num">{pickNumber}</span> · <span className="font-medium text-on-surface">{who}</span> to {teamName}
          </>
        )}
      </p>
      <div className="flex shrink-0 gap-2">
        {confirming ? (
          <>
            <Button size="sm" variant="ghost" onPress={() => setConfirming(false)} isDisabled={busy}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onPress={confirm} isDisabled={busy}>
              {busy ? "Undoing…" : "Undo pick"}
            </Button>
          </>
        ) : (
          <Button size="sm" onPress={() => setConfirming(true)}>
            Undo pick
          </Button>
        )}
      </div>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </div>
  );
}

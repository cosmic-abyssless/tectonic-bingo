import { useRef, useState } from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import { Dialog, DialogTrigger, Popover } from "react-aria-components";
import { Button, IconButton } from "../ui/Button";
import { UndoIcon } from "../ui/icons";
import { portalScope } from "../ui/portalScope";
import { TextTooltip } from "../ui/Tooltip";

/** The latest pick, which a site admin can take back (a misclicked draft). */
export interface UndoLatestPick {
  pickNumber: number;
  names: string[];
  teamName: string;
  busy: boolean;
  error: string | null;
  onUndo: () => Promise<boolean>;
}

/**
 * The undo button on the latest pick's slip in the team rosters. It asks first, in a popover beside it, naming who is
 * about to leave which team, so a stray press doesn't undo anything.
 */
export function UndoPickButton({ undo }: { undo: UndoLatestPick }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const who = undo.names.join(" & ");

  async function confirm() {
    if (await undo.onUndo()) setOpen(false);
  }

  return (
    // The span only anchors the popover's portal (display: contents, no box of its own).
    <span ref={anchor} className="contents">
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        <TextTooltip text="Undo pick">
          <IconButton label="Undo pick" size="sm" className="-my-1 shrink-0">
            <UndoIcon size={14} />
          </IconButton>
        </TextTooltip>
        {/* Opened inside the surface the roster is on (see portalScope), so it takes that surface's look. */}
        <UNSAFE_PortalProvider getContainer={() => portalScope(anchor.current)}>
          <Popover
            placement="bottom end"
            offset={6}
            data-popover-panel=""
            className="overlay-panel w-72 rounded-md border border-outline bg-surface-raised p-3 shadow-pop outline-none"
          >
            <Dialog aria-label="Undo pick" className="space-y-3 text-sm text-on-surface-muted outline-none">
              <p>
                Take back pick <span className="num">{undo.pickNumber}</span>, <span className="font-medium text-on-surface">{who}</span>, from {undo.teamName}? They go
                back into the pool and {undo.teamName} is on the clock again.
              </p>
              {undo.error && <p className="text-danger">{undo.error}</p>}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onPress={() => setOpen(false)} isDisabled={undo.busy}>
                  Cancel
                </Button>
                <Button size="sm" variant="danger" onPress={confirm} isDisabled={undo.busy}>
                  {undo.busy ? "Undoing…" : "Undo pick"}
                </Button>
              </div>
            </Dialog>
          </Popover>
        </UNSAFE_PortalProvider>
      </DialogTrigger>
    </span>
  );
}

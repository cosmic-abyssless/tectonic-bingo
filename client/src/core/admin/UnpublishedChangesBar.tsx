import { useState } from "react";
import type { Bingo, DraftBoardResponse } from "@bingo/shared";
import { Button } from "../ui/Button";
import { timeAgo } from "../ui/time";
import { DraftBoardPreview } from "./DraftBoardPreview";
import { DiscardBoardDialog, PublishBoardDialog } from "./PublishBoardDialog";

/**
 * The Board tab's head (CONTEXT.md "Draft board"): while the Draft board differs from the Published board, who changed
 * it last, with Publish and Discard; and always the preview of the board as Players would see it. Admins only, as the
 * whole Board tab is.
 */
export function UnpublishedChangesBar({ slug, bingo, draft, locked }: { slug: string; bingo: Bingo; draft: DraftBoardResponse; locked: boolean }) {
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const { status } = draft;
  const who = status.updatedBy?.name ?? null;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 text-sm ${status.hasChanges ? "border-warn/40 bg-warn/5" : "border-outline bg-surface-raised"}`}
      role={status.hasChanges ? "status" : undefined}
    >
      <div className="min-w-0 flex-1">
        {status.hasChanges ? (
          <>
            <p className="font-medium text-on-surface">Unpublished changes</p>
            <p className="text-xs text-on-surface-muted">
              Only Admins see them until they're published.
              {status.updatedAt && (
                <>
                  {" "}
                  Last changed{who ? ` by ${who}` : ""} {timeAgo(status.updatedAt)}.
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-on-surface-muted">Changes here go to a draft of the board. Players see them once an Admin publishes it.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onPress={() => setPreviewing(true)}>
          Preview as Players
        </Button>
        {status.hasChanges && (
          <>
            <Button size="sm" variant="secondary" onPress={() => setDiscarding(true)}>
              Discard
            </Button>
            <Button size="sm" variant="primary" onPress={() => setPublishing(true)} isDisabled={locked}>
              Review and publish
            </Button>
          </>
        )}
      </div>
      <DraftBoardPreview bingo={bingo} draft={draft} isOpen={previewing} onClose={() => setPreviewing(false)} />
      <PublishBoardDialog slug={slug} isOpen={publishing} onClose={() => setPublishing(false)} />
      <DiscardBoardDialog slug={slug} isOpen={discarding} lastChangedBy={who} onClose={() => setDiscarding(false)} />
    </div>
  );
}

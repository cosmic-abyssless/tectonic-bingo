import type { RewindClosingModel } from "../../../headless/types";
import { TitlesSection } from "../../../core/stats/TitlesSection";
import { XIcon } from "../../../core/ui/icons";
import { IconButton } from "../../../core/ui/Button";

/**
 * The closing card, plain: "Final Titles" for the viewed Team or the whole Bingo, then every Title as the Stats page
 * lists them. Tall on a big Bingo, so it scrolls within the room between the header and the timeline.
 */
export function RewindClosing({ closing }: { closing: RewindClosingModel }) {
  return (
    <div
      role="dialog"
      aria-label="Final Titles"
      className="relative flex max-h-[calc(100dvh-16rem)] w-[min(52rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-accent bg-surface-raised text-on-surface shadow-pop"
      style={closing.team?.color ? { borderTopColor: closing.team.color, borderTopWidth: 4 } : undefined}
    >
      <div className="shrink-0 pb-2 pl-3 pr-8 pt-2.5">
        <p className="text-base font-semibold">Final Titles</p>
        <p className="truncate text-xs text-on-surface-muted">
          {closing.team?.color && <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ backgroundColor: closing.team.color }} />}
          {closing.team ? closing.team.name : "The whole bingo"}
        </p>
      </div>
      <div className="min-h-0 overflow-y-auto px-3 pb-3">
        <TitlesSection picked={closing.titles} contributions={closing.contributions} womReadAt={closing.womReadAt} note={false} />
      </div>
      <IconButton size="sm" label="Close" onPress={closing.close} className="absolute right-1 top-1">
        <XIcon size={14} />
      </IconButton>
    </div>
  );
}

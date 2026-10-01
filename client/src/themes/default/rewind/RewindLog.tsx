import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import type { SignificanceTier } from "@bingo/shared";
import type { RewindLogEntryModel, RewindLogModel } from "../../../headless/types";
import { TextTooltip } from "../../../core/ui/Tooltip";
import { Button } from "../../../core/ui/Button";

// How many entries a phone shows before "Show all" (a wide screen scrolls the whole log instead).
const PHONE_ENTRIES = 5;
// The tier dot, sized like the timeline's ticks: the bigger the Submission, the bigger the dot.
const DOT_SIZE: Record<SignificanceTier, string> = { minor: "size-1.5", notable: "size-2", huge: "size-2.5" };

/**
 * Every Submission so far, newest first, one compact line each: its tier dot (its Team's colour in the All Teams
 * view), Player, time, items, Tile and Drop value. Pressing one jumps there and shows its popup. On a wide screen it
 * scrolls within the height the page leaves it; on a phone it shows the latest few with "Show all".
 */
export function RewindLog({ log }: { log: RewindLogModel }) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const listId = useId();
  const hidden = log.entries.length - PHONE_ENTRIES;
  // A stable handler for the memoised rows: log.jumpTo is a new function every render.
  const jumpRef = useRef(log.jumpTo);
  jumpRef.current = log.jumpTo;
  const onJump = useCallback((id: string) => jumpRef.current(id), []);

  // The Submission in focus is always the newest one so far: keep the top in view as Play adds them.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [log.currentId]);

  return (
    <section aria-label="Submissions" className="flex min-h-0 flex-col rounded-md border border-outline bg-surface">
      <h2 className="flex shrink-0 items-baseline justify-between border-b border-outline px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-subtle">
        Submissions
        <span className="num normal-case tracking-normal">{log.entries.length.toLocaleString()}</span>
      </h2>
      {log.entries.length === 0 ? (
        <p className="px-3 py-3 text-xs text-on-surface-subtle">Nothing submitted yet.</p>
      ) : (
        <ol id={listId} ref={listRef} className="divide-y divide-outline min-h-0 lg:overflow-y-auto">
          {log.entries.map((entry, i) => (
            <LogRow key={entry.id} entry={entry} current={entry.id === log.currentId} phoneHidden={!expanded && i >= PHONE_ENTRIES} onJump={onJump} />
          ))}
        </ol>
      )}
      {hidden > 0 && (
        <div className="border-t border-outline lg:hidden">
          <Button variant="ghost" size="sm" aria-expanded={expanded} aria-controls={listId} onPress={() => setExpanded((e) => !e)} className="w-full rounded-none">
            {expanded ? "Show fewer" : `Show all (${log.entries.length.toLocaleString()})`}
          </Button>
        </div>
      )}
    </section>
  );
}

// Memoised: Play re-renders the log every step, and only the rows that came or went (or gained focus) change.
const LogRow = memo(function LogRow({ entry, current, phoneHidden, onJump }: { entry: RewindLogEntryModel; current: boolean; phoneHidden: boolean; onJump: (id: string) => void }) {
  const accent = entry.tier === "minor" ? "bg-on-surface-subtle" : "bg-accent";
  return (
    <li className={phoneHidden ? "hidden lg:block" : undefined}>
      <TextTooltip text={`${entry.timeLabel}${entry.team ? ` · ${entry.team.name}` : ""}`} placement="left">
        <button
          type="button"
          onClick={() => onJump(entry.id)}
          aria-current={current ? "true" : undefined}
          className={`relative flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover ${current ? "bg-accent/10" : ""} ${entry.rejected ? "opacity-60" : ""}`}
        >
          <span className="flex h-4 w-2.5 shrink-0 items-center justify-center">
            <span
              className={`rounded-full ${DOT_SIZE[entry.tier]} ${entry.team?.color && !entry.rejected ? "" : entry.rejected ? "bg-on-surface-subtle/40" : accent}`}
              style={entry.team?.color && !entry.rejected ? { backgroundColor: entry.team.color } : undefined}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className={`min-w-0 flex-1 truncate text-sm ${entry.tier === "minor" ? "text-on-surface-muted" : "font-medium text-on-surface"}`}>{entry.playerName ?? "Unknown player"}</span>
              <span className="num shrink-0 text-[11px] text-on-surface-subtle">{entry.sinceStartLabel}</span>
            </span>
            <span className="flex items-baseline gap-2 text-xs text-on-surface-subtle">
              <span className={`min-w-0 flex-1 truncate ${entry.rejected ? "line-through" : ""}`}>
                {entry.itemsLabel}
                {entry.tileName && <> · {entry.tileName}</>}
              </span>
              {entry.rejected ? (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-danger">Rejected</span>
              ) : (
                entry.gpLabel && <span className="num shrink-0 font-medium text-on-surface-muted">{entry.gpLabel}</span>
              )}
            </span>
          </span>
        </button>
      </TextTooltip>
    </li>
  );
});

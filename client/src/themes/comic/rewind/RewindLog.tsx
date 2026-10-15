import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import type { RewindLogEntryModel, RewindLogModel } from "../../../headless/types";
import { TextTooltip } from "../../../core/ui/Tooltip";
import type { ComicColors } from "../board/colors";
import { COMIC_FIGURES_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { display } from "../wrapped/sections/sectionParts-team-bingo";
import { LETTERED } from "../../lettering";
import { RewindPanel, TierMark } from "./rewindParts";

// How many entries a phone shows before "Show all" (a wide screen scrolls the whole log instead).
const PHONE_ENTRIES = 5;

/**
 * Every Submission so far, newest first, one line each in an ink panel: its tier mark (a dot, a diamond, a starburst:
 * the bigger the Submission, the louder; its Team's colour in the All Teams view), Player, time, items, Tile and Drop
 * value on a green tag, or a red Rejected stamp. Pressing one jumps there and shows its popup. On a wide screen it
 * scrolls within the height the page leaves it; on a phone it shows the latest few with "Show all".
 */
export function RewindLog({ log }: { log: RewindLogModel }) {
  const { colors } = useComic();
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
    <RewindPanel title="Submissions" count={log.entries.length.toLocaleString()}>
      {log.entries.length === 0 ? (
        <p className="px-3 py-3 text-sm italic" style={{ color: colors.INK_SUBTLE }}>
          Nothing submitted yet.
        </p>
      ) : (
        <ol id={listId} ref={listRef} className="min-h-0 lg:overflow-y-auto">
          {log.entries.map((entry, i) => (
            <LogRow
              key={entry.id}
              entry={entry}
              first={i === 0}
              current={entry.id === log.currentId}
              phoneHidden={!expanded && i >= PHONE_ENTRIES}
              onJump={onJump}
              colors={colors}
            />
          ))}
        </ol>
      )}
      {hidden > 0 && (
        <div className="flex justify-center border-t-[3px] py-2 lg:hidden" style={{ borderColor: colors.LINE }}>
          <ComicButton variant="secondary" size="sm" sfx={false} aria-expanded={expanded} aria-controls={listId} onPress={() => setExpanded((e) => !e)}>
            {expanded ? "Show fewer" : `Show all (${log.entries.length.toLocaleString()})`}
          </ComicButton>
        </div>
      )}
    </RewindPanel>
  );
}

// Memoised: Play re-renders the log every step, and only the rows that came or went (or gained focus) change.
const LogRow = memo(function LogRow({
  entry,
  first,
  current,
  phoneHidden,
  onJump,
  colors,
}: {
  entry: RewindLogEntryModel;
  first: boolean;
  current: boolean;
  phoneHidden: boolean;
  onJump: (id: string) => void;
  colors: ComicColors;
}) {
  const teamFill = entry.team?.color && !entry.rejected ? entry.team.color : null;
  return (
    <li className={`${phoneHidden ? "hidden lg:block" : ""} ${first ? "" : "border-t"}`} style={{ borderColor: colors.RULE }}>
      <TextTooltip text={`${entry.timeLabel}${entry.team ? ` · ${entry.team.name}` : ""}`} placement="left">
        <button
          type="button"
          onClick={() => onJump(entry.id)}
          aria-current={current ? "true" : undefined}
          className={`relative flex w-full cursor-pointer items-start gap-2 px-3 py-1.5 text-left outline-none transition-colors hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)] ${entry.rejected ? "opacity-60" : ""}`}
          style={{
            background: current ? colors.YELLOW : undefined,
            color: current ? colors.ON_YELLOW : colors.INK,
            ["--row-hover" as string]: current ? colors.YELLOW : colors.PAPER,
          }}
        >
          <span className="flex h-5 w-[18px] shrink-0 items-center justify-center">
            <TierMark
              tier={entry.rejected ? "minor" : entry.tier}
              fill={entry.rejected ? colors.RULE : (teamFill ?? (current && entry.tier === "notable" ? colors.PAPER_RAISED : null))}
              colors={colors}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className={`min-w-0 flex-1 truncate text-sm ${entry.tier === "minor" ? "font-semibold" : "font-bold"}`}>
                {entry.playerName ?? "Unknown player"}
              </span>
              <span
                className="num shrink-0 text-[11px] font-bold"
                style={{
                  color: current ? colors.ON_YELLOW : colors.INK_SUBTLE,
                  fontFamily: COMIC_FIGURES_FONT,
                }}
              >
                {entry.sinceStartLabel}
              </span>
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: current ? colors.ON_YELLOW : colors.INK_SUBTLE }}>
              <span className={`min-w-0 flex-1 truncate ${entry.rejected ? "line-through" : ""}`}>
                {entry.itemsLabel}
                {entry.tileName && <> · {entry.tileName}</>}
              </span>
              {entry.rejected ? (
                <span
                  className={`${LETTERED} shrink-0 -rotate-3 border-2 px-1 pt-px leading-none`}
                  style={{
                    ...display(11, { letterSpacing: "0.06em" }),
                    color: colors.BAD,
                    borderColor: colors.BAD,
                  }}
                >
                  Rejected
                </span>
              ) : (
                entry.gpLabel && (
                  <span
                    className={`${LETTERED} num shrink-0 border-[1.5px] px-1 pt-px leading-none`}
                    style={{
                      ...display(12),
                      background: colors.GREEN_TINT,
                      borderColor: colors.LINE,
                      color: colors.INK,
                    }}
                  >
                    {entry.gpLabel}
                  </span>
                )
              )}
            </span>
          </span>
        </button>
      </TextTooltip>
    </li>
  );
});

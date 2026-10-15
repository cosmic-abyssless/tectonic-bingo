import { useRef, useState, type PointerEvent } from "react";
import type { SignificanceTier } from "@bingo/shared";
import type { RewindTickModel, RewindTimelineModel } from "../../../headless/types";
import { RangeInput } from "../../../core/ui/RangeInput";
import { COMIC_FIGURES_FONT } from "../font";
import { useComic } from "../ui/useComic";
import { display } from "../wrapped/sections/sectionParts-team-bingo";
import { LETTERED } from "../../lettering";
import { TeamDot, TierMark } from "./rewindParts";

// How tall each tier's tick stands, as a share of the track, and how wide.
const TICK_HEIGHT: Record<SignificanceTier, string> = {
  minor: "30%",
  notable: "60%",
  huge: "94%",
};
const TICK_WIDTH: Record<SignificanceTier, number> = {
  minor: 2,
  notable: 3,
  huge: 4,
};
// How near the pointer has to be to a tick, in px, for hovering to name it.
const HOVER_REACH_PX = 8;

/**
 * The Bingo from going Live to Finishing, as an ink-bordered strip: what has been played is printed yellow with rays, as
 * the Wrapped's grounds are, the rest is plain paper with a dot screen. One tick per Submission of the viewed Team,
 * sized by its tier (its Team's colour, outlined, in the All Teams view), black over the yellow, and a red playhead
 * with a tab on top. Hovering a tick (with a mouse) names its Submission in a card above it. Where the moment is sits
 * in a lettered caption between the start and the end. The scrubber is a native range input stretched over the strip,
 * so dragging, clicking and the arrow keys all seek, on touch too.
 */
export function RewindTimeline({ timeline }: { timeline: RewindTimelineModel }) {
  const { colors } = useComic();
  const ticksRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const hovered = hoverId ? (timeline.ticks.find((t) => t.id === hoverId) ?? null) : null;
  const pct = (p: number) => `${Math.min(100, Math.max(0, p * 100))}%`;

  // The tick nearest the pointer, if it's within reach.
  const onPointerMove = (e: PointerEvent) => {
    const box = ticksRef.current?.getBoundingClientRect();
    if (e.pointerType !== "mouse" || !box || box.width === 0) return;
    const p = (e.clientX - box.left) / box.width;
    let best: RewindTickModel | null = null;
    for (const tick of timeline.ticks) if (!best || Math.abs(tick.position - p) < Math.abs(best.position - p)) best = tick;
    setHoverId(best && Math.abs(best.position - p) * box.width <= HOVER_REACH_PX ? best.id : null);
  };

  return (
    <div className="w-full">
      <div
        className="relative h-12 border-[3px] max-sm:h-10"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverId(null)}
        style={{
          borderColor: colors.LINE,
          background: colors.PAPER,
          backgroundImage: `radial-gradient(${colors.RULE} 1px, transparent 1.6px)`,
          backgroundSize: "6px 6px",
          boxShadow: `3px 3px 0 ${colors.SHADOW}`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 border-r-[3px]"
          style={{
            width: pct(timeline.position),
            borderColor: colors.LINE,
            background: colors.YELLOW,
            backgroundImage: `repeating-conic-gradient(from 0deg at 100% 120%, rgb(255 255 255 / 0.22) 0deg 4deg, transparent 4deg 10deg)`,
          }}
        />
        <div ref={ticksRef} className="pointer-events-none absolute inset-x-1.5 inset-y-1">
          {timeline.ticks.map((tick) => {
            const team = tick.teamColor && !tick.rejected ? tick.teamColor : null;
            const lit = tick.id === hoverId;
            // Over the yellow (played), ink is the palette's ink-on-yellow, black in every palette.
            const ink = tick.past ? colors.ON_YELLOW : colors.LINE;
            return (
              <span
                key={tick.id}
                className="absolute bottom-0 -translate-x-1/2"
                style={{
                  left: pct(tick.position),
                  height: TICK_HEIGHT[tick.tier],
                  width: TICK_WIDTH[tick.tier] + (team ? 2 : 0) + (lit ? 2 : 0),
                  background: tick.current ? colors.RED : (team ?? (tick.past ? colors.ON_YELLOW : tick.rejected ? colors.RULE : colors.INK_SUBTLE)),
                  opacity: tick.past || tick.current || lit ? (tick.past && tick.rejected && !team ? 0.4 : 1) : team ? 0.4 : 0.45,
                  outline: team ? `1px solid ${ink}` : undefined,
                }}
              />
            );
          })}
        </div>
        {/* The playhead: a red rule through the strip with a tab on top. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-1 -top-2 w-[3px] -translate-x-1/2"
          style={{
            left: pct(timeline.position),
            background: colors.RED,
            boxShadow: `0 0 0 1.5px ${colors.LINE}`,
          }}
        >
          <span className="absolute -top-1 left-1/2 size-3 -translate-x-1/2 rotate-45 border-2" style={{ background: colors.RED, borderColor: colors.LINE }} />
        </span>
        <RangeInput
          aria-label="Moment in the bingo"
          aria-valuetext={`${timeline.atLabel}, ${timeline.atClockLabel}`}
          min={timeline.start}
          max={timeline.end}
          step={1000}
          value={timeline.at}
          onChange={timeline.seek}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        {hovered && (
          <div aria-hidden className="pointer-events-none absolute inset-x-1.5 bottom-full z-30 mb-3">
            <TickCard tick={hovered} />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[12px] font-bold" style={{ color: colors.INK_SUBTLE, fontFamily: COMIC_FIGURES_FONT }}>
        <span className="truncate">{timeline.startLabel}</span>
        <span
          className={`${LETTERED} num shrink-0 whitespace-nowrap border-2 px-2 pt-[3px] pb-px`}
          style={{
            ...display(15, { letterSpacing: "0.05em" }),
            background: colors.PAPER_RAISED,
            borderColor: colors.LINE,
            color: colors.INK,
            boxShadow: `2px 2px 0 ${colors.SHADOW}`,
          }}
        >
          {timeline.atLabel} <span style={{ color: colors.INK_SUBTLE }}>· {timeline.atClockLabel}</span>
        </span>
        <span className="truncate text-right">{timeline.endLabel}</span>
      </div>
    </div>
  );
}

/**
 * A hovered tick's Submission, as the log names it, in a small ink panel standing over the tick with a tail down to it:
 * its tier mark, Player and when, its items and Tile, its Team in the All Teams view, and its Drop value or Rejected.
 * Kept inside the strip's width: it slides from left-aligned at the start to right-aligned at the end.
 */
function TickCard({ tick }: { tick: RewindTickModel }) {
  const { colors } = useComic();
  const { entry } = tick;
  const p = Math.min(1, Math.max(0, tick.position));
  const teamFill = entry.team?.color && !entry.rejected ? entry.team.color : null;
  return (
    <div className="absolute bottom-0" style={{ left: `${p * 100}%` }}>
      <div
        className="relative w-64 border-[3px] px-3 py-2"
        style={{
          transform: `translateX(-${p * 100}%)`,
          background: colors.PAPER_RAISED,
          borderColor: colors.LINE,
          boxShadow: `3px 3px 0 ${colors.SHADOW}`,
          color: colors.INK,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-[18px] shrink-0 items-center justify-center">
            <TierMark tier={entry.rejected ? "minor" : entry.tier} fill={entry.rejected ? colors.RULE : teamFill} colors={colors} />
          </span>
          <span className={`min-w-0 flex-1 truncate text-sm ${entry.tier === "minor" ? "font-semibold" : "font-bold"}`}>
            {entry.playerName ?? "Unknown player"}
          </span>
          <span className="num shrink-0 text-[11px] font-bold" style={{ color: colors.INK_SUBTLE, fontFamily: COMIC_FIGURES_FONT }}>
            {entry.sinceStartLabel}
          </span>
        </div>
        <p className={`mt-1 line-clamp-2 text-xs ${entry.rejected ? "line-through" : ""}`} style={{ color: colors.INK_BODY }}>
          {entry.itemsLabel}
          {entry.tileName && <span style={{ color: colors.INK_SUBTLE }}> · {entry.tileName}</span>}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px]" style={{ color: colors.INK_SUBTLE }}>
          {entry.team && (
            <>
              <TeamDot color={entry.team.color} size={10} />
              <span className="min-w-0 truncate font-semibold">{entry.team.name}</span>
              <span>·</span>
            </>
          )}
          <span className="num min-w-0 flex-1 truncate font-bold" style={{ fontFamily: COMIC_FIGURES_FONT }}>
            {entry.timeLabel}
          </span>
          {entry.rejected ? (
            <span
              className={`${LETTERED} shrink-0 -rotate-3 border-2 px-1 pt-px leading-none`}
              style={{ ...display(11, { letterSpacing: "0.06em" }), color: colors.BAD, borderColor: colors.BAD }}
            >
              Rejected
            </span>
          ) : (
            entry.gpLabel && (
              <span
                className={`${LETTERED} num shrink-0 border-[1.5px] px-1 pt-px leading-none`}
                style={{ ...display(12), background: colors.GREEN_TINT, borderColor: colors.LINE, color: colors.INK }}
              >
                {entry.gpLabel}
              </span>
            )
          )}
        </div>
      </div>
      {/* The tail, down to the tick; its open top sits over the card's border. */}
      <svg aria-hidden viewBox="0 0 16 12" className="absolute -bottom-[9px] -left-2 h-3 w-4 overflow-visible">
        <path d="M0 0 L8 12 L16 0" fill={colors.PAPER_RAISED} stroke={colors.LINE} strokeWidth={3} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

import type { SignificanceTier } from "@bingo/shared";
import type { RewindTimelineModel } from "../../../headless/types";
import { RangeInput } from "../../../core/ui/RangeInput";
import { COMIC_FIGURES_FONT } from "../font";
import { useComic } from "../ui/useComic";
import { display } from "../wrapped/sections/sectionParts-team-bingo";
import { LETTERED } from "../../lettering";

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

/**
 * The Bingo from going Live to Finishing, as an ink-bordered strip: what has been played is printed yellow with rays, as
 * the Wrapped's grounds are, the rest is plain paper with a dot screen. One ink tick per Submission of the viewed Team,
 * sized by its tier (its Team's colour, outlined, in the All Teams view), and a red playhead with a tab on top. Where the
 * moment is sits in a lettered caption between the start and the end. The scrubber is a native range input stretched
 * over the strip, so dragging, clicking and the arrow keys all seek, on touch too.
 */
export function RewindTimeline({ timeline }: { timeline: RewindTimelineModel }) {
  const { colors } = useComic();
  const pct = (p: number) => `${Math.min(100, Math.max(0, p * 100))}%`;
  return (
    <div className="w-full">
      <div
        className="relative h-12 border-[3px] max-sm:h-10"
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
        <div className="pointer-events-none absolute inset-x-1.5 inset-y-1">
          {timeline.ticks.map((tick) => {
            const team = tick.teamColor && !tick.rejected ? tick.teamColor : null;
            return (
              <span
                key={tick.id}
                className="absolute bottom-0 -translate-x-1/2"
                style={{
                  left: pct(tick.position),
                  height: TICK_HEIGHT[tick.tier],
                  width: TICK_WIDTH[tick.tier] + (team ? 2 : 0),
                  background: tick.current ? colors.RED : (team ?? (tick.rejected ? colors.RULE : tick.past ? colors.LINE : colors.INK_SUBTLE)),
                  opacity: tick.past || tick.current ? 1 : team ? 0.4 : 0.45,
                  outline: team ? `1px solid ${colors.LINE}` : undefined,
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

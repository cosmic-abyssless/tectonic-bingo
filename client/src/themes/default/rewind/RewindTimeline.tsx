import type { SignificanceTier } from "@bingo/shared";
import type { RewindTimelineModel } from "../../../headless/types";

// How tall each tier's tick stands, as a share of the track.
const TICK_HEIGHT: Record<SignificanceTier, string> = { minor: "28%", notable: "58%", huge: "92%" };
const TICK_WIDTH: Record<SignificanceTier, number> = { minor: 1, notable: 2, huge: 3 };

/**
 * The Bingo from going Live to Finishing, in real time: quiet stretches show as gaps. One tick per Submission of the
 * viewed Team, sized by its tier; the ones already on the Board are in the accent colour. In the All Teams view each
 * tick is its Team's colour instead, faded until it's on the Board. The scrubber is a native
 * range input stretched over the track, so dragging, clicking and the arrow keys all seek, on touch too.
 */
export function RewindTimeline({ timeline }: { timeline: RewindTimelineModel }) {
  const pct = (p: number) => `${Math.min(100, Math.max(0, p * 100))}%`;
  return (
    <div className="w-full">
      <div className="relative h-12 rounded-md border border-outline bg-surface">
        <div className="absolute inset-y-0 left-0 rounded-l-md bg-accent/10" style={{ width: pct(timeline.position) }} />
        <div className="pointer-events-none absolute inset-x-1.5 inset-y-1">
          {timeline.ticks.map((tick) => (
            <span
              key={tick.id}
              className={`absolute bottom-0 -translate-x-1/2 rounded-full ${
                tick.rejected ? "bg-on-surface-subtle/40" : tick.past ? "bg-accent" : "bg-on-surface-subtle/70"
              } ${tick.current ? "ring-2 ring-on-surface" : ""}`}
              style={{
                left: pct(tick.position),
                height: TICK_HEIGHT[tick.tier],
                width: TICK_WIDTH[tick.tier],
                ...(tick.teamColor && !tick.rejected ? { backgroundColor: tick.teamColor, opacity: tick.past ? 1 : 0.35 } : {}),
              }}
            />
          ))}
          <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-on-surface" style={{ left: pct(timeline.position) }} />
        </div>
        <input
          type="range"
          aria-label="Moment in the bingo"
          aria-valuetext={`${timeline.atLabel}, ${timeline.atClockLabel}`}
          min={timeline.start}
          max={timeline.end}
          step={1000}
          value={timeline.at}
          onChange={(e) => timeline.seek(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px] text-on-surface-subtle">
        <span>{timeline.startLabel}</span>
        <span className="num font-medium text-on-surface">
          {timeline.atLabel} <span className="font-normal text-on-surface-subtle">· {timeline.atClockLabel}</span>
        </span>
        <span>{timeline.endLabel}</span>
      </div>
    </div>
  );
}

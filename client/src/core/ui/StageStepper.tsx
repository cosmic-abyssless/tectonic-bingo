import { STAGE_LABEL, STAGE_ORDER, nextMilestone, type Bingo, type Stage } from "@bingo/shared";
import { CountdownTimer } from "./CountdownTimer";
import { ClockIcon } from "./icons";

/** Horizontal progress of the bingo's lifecycle; current stage highlighted. */
export function StageStepper({ stage }: { stage: Stage }) {
  const currentIdx = STAGE_ORDER.indexOf(stage);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto" aria-label="Bingo stage">
      {STAGE_ORDER.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "todo";
        return (
          <li key={s} className="flex items-center gap-1" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={`whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4 ${
                state === "current" ? "bg-accent text-accent-fg" : state === "done" ? "text-fg-muted" : "text-fg-subtle"
              }`}
            >
              {STAGE_LABEL[s]}
            </span>
            {i < STAGE_ORDER.length - 1 && <span className={`h-px w-3 ${i < currentIdx ? "bg-line-strong" : "bg-line"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "Draft in 2 days 3 hours" / "Draft — time TBA". Returns null once the
 * bingo is complete (nothing left to wait for).
 */
export function MilestoneCountdown({ bingo, className }: { bingo: Bingo; className?: string }) {
  const milestone = nextMilestone(bingo);
  if (!milestone) return null;
  const at = milestone.at ? new Date(milestone.at) : null;
  const upcoming = at !== null && at.getTime() > Date.now();
  return (
    <div className={`flex items-baseline gap-2 text-sm text-fg-muted ${className ?? ""}`}>
      <ClockIcon className="shrink-0 self-center text-fg-subtle" />
      <span>
        {milestone.label}
        {upcoming ? (
          <>
            {" in "}
            <CountdownTimer target={at.getTime()} className="text-fg" />
          </>
        ) : at ? (
          <span className="text-fg-subtle"> — waiting on a mod</span>
        ) : (
          <span className="text-fg-subtle"> — time to be announced</span>
        )}
      </span>
      {upcoming && (
        <time dateTime={at.toISOString()} className="num hidden text-xs text-fg-subtle sm:inline" title={at.toLocaleString()}>
          {at.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
        </time>
      )}
    </div>
  );
}

// The dates of a generated bingo, worked out from the stage the run should end on.
//
// The moments are fixed offsets from `startsAt`: signups open 21 days before, the captains stage 5 days
// before, the draft 3 days before, reveal 2 days before. `now` then has to land inside the target stage, which
// fixes `startsAt` (and so everything else). For the stages that are still ahead of us, the later moments are
// simply scheduled dates in the future.
export const DAY = 24 * 3600_000;
export const HOUR = 3600_000;
export const MINUTE = 60_000;

export type TargetStage = "signup" | "captains" | "draft" | "reveal" | "live" | "complete";
export const TARGET_STAGES: readonly TargetStage[] = ["signup", "captains", "draft", "reveal", "live", "complete"];

export interface Timeline {
  stage: TargetStage;
  now: Date;
  /** The bingo is created and its settings filled in. */
  createdAt: Date;
  signupOpensAt: Date;
  captainsAt: Date;
  draftAt: Date;
  revealAt: Date;
  startsAt: Date;
  endsAt: Date;
  /** When an admin moves a finished bingo to "complete". */
  completeAt: Date;
  days: number;
}

export function buildTimeline(stage: TargetStage, opts: { now: Date; progress: number; days: number }): Timeline {
  const { now, progress, days } = opts;
  const length = days * DAY;
  const at = (ms: number) => new Date(ms);

  // Where `now` sits inside the target stage, which pins startsAt.
  const startMs = {
    signup: now.getTime() - 8 * DAY + 21 * DAY, // signups have been open 8 days
    captains: now.getTime() - 1 * DAY + 5 * DAY, // in the captains stage for a day
    draft: now.getTime() - 1 * HOUR + 3 * DAY, // the draft opened an hour ago
    reveal: now.getTime() - 6 * HOUR + 2 * DAY, // revealed 6 hours ago
    live: now.getTime() - progress * length,
    complete: now.getTime() - length - 1 * DAY, // ended a day ago
  }[stage];

  return {
    stage,
    now,
    createdAt: at(startMs - 23 * DAY),
    signupOpensAt: at(startMs - 21 * DAY),
    captainsAt: at(startMs - 5 * DAY),
    draftAt: at(startMs - 3 * DAY),
    revealAt: at(startMs - 2 * DAY),
    startsAt: at(startMs),
    endsAt: at(startMs + length),
    completeAt: at(startMs + length + 1 * HOUR),
    days,
  };
}

/** The last moment the run may act on: `now`, except a finished bingo, whose last moment is when it was completed. */
export function runLimit(tl: Timeline): Date {
  return tl.stage === "complete" ? tl.completeAt : tl.now;
}

export const fmt = (d: Date): string => d.toISOString().replace("T", " ").slice(0, 16) + "Z";

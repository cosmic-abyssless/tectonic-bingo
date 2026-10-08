import { useCountdown } from "../../../core/ui/CountdownTimer";
import { Notice } from "../../../core/ui/Card";
import { ClockIcon } from "../../../core/ui/icons";
import { formatDuration, formatLocalDateTime, formatMinutesSeconds } from "../../../core/ui/time";

/** The last minutes before the start, when the countdown grows and shows its seconds. */
const FINAL_STRETCH_MS = 10 * 60_000;

/**
 * Above the Board until the Bingo starts: how long until it does, and when that is in the player's own time zone. In
 * the last ten minutes the countdown grows to a big minutes-and-seconds clock, for the run-up to the start.
 */
export function PreStartBanner({ startsAt }: { startsAt: number }) {
  const remaining = useCountdown(startsAt);
  const finalStretch = remaining <= FINAL_STRETCH_MS;
  const when = (
    <span className="text-xs">
      Starts <time dateTime={new Date(startsAt).toISOString()}>{formatLocalDateTime(startsAt)}</time>, your local time.
    </span>
  );

  if (finalStretch) {
    return (
      <Notice tone="info" icon={<ClockIcon />} className="mb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-on-surface">Bingo starts in</span>
          {/* Not a live region: read every second it would talk over everything else. */}
          <time dateTime={new Date(startsAt).toISOString()} className="num text-4xl font-bold leading-none tracking-tight text-on-surface sm:text-5xl">
            {formatMinutesSeconds(remaining)}
          </time>
        </div>
        <div className="mt-1.5">Look over the tiles now — submissions open when the timer hits zero. {when}</div>
      </Notice>
    );
  }

  return (
    <Notice tone="info" icon={<ClockIcon />} className="mb-3">
      Bingo starts in <span className="num text-on-surface">{formatDuration(remaining)}</span>. Look over the tiles now — submissions open when the timer hits zero.
      <div className="mt-0.5">{when}</div>
    </Notice>
  );
}

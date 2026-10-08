import { useCountdown } from "../../../core/ui/CountdownTimer";
import { countdownUnits, FINAL_STRETCH_MS } from "../../../core/ui/startCountdown";
import { formatDuration, formatLocalDateTime, formatMinutesSeconds } from "../../../core/ui/time";
import { COMIC_FONT } from "../font";
import { Burst } from "../ui/Burst";
import { PrintedShade } from "../ui/tones";
import { useComic } from "../ui/useComic";
import { LETTERED } from "../../lettering";

/**
 * The countdown to the start above the Board, in the scouting banner's night-sky caption (outlined cover lettering,
 * halftone shading). Until the last ten minutes it's a slim strip across the Board: the time left in small inked chips
 * (1 DAY 17 HRS 58 MIN), with when the start is in the player's own time zone beside it. Then it grows into a cover
 * blurb for the run-up, knocked askew, with a big minutes-and-seconds clock in a starburst.
 */
export function ComicPreStartBanner({ startsAt }: { startsAt: number }) {
  const remaining = useCountdown(startsAt);
  return remaining <= FINAL_STRETCH_MS ? <FinalStretch startsAt={startsAt} remaining={remaining} /> : <Strip startsAt={startsAt} remaining={remaining} />;
}

/** The start time in the player's own zone, and that it's theirs. */
function LocalStart({ startsAt }: { startsAt: number }) {
  return (
    <>
      Starts <time dateTime={new Date(startsAt).toISOString()}>{formatLocalDateTime(startsAt)}</time>, your local time.
    </>
  );
}

function Strip({ startsAt, remaining }: { startsAt: number; remaining: number }) {
  const { colors } = useComic();
  return (
    // As wide as the Board: the title and the time left on the left, the when and what-next to their right (under them
    // on a phone).
    <div className="mb-4 w-full px-1">
      <div
        className="relative flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden border-[3px] px-3 py-2 sm:px-4"
        // The scouting banner's night-sky blue, as in the final stretch.
        style={{ background: `color-mix(in srgb, ${colors.BLUE} 70%, ${colors.ON_YELLOW})`, borderColor: colors.LINE, color: colors.ON_LOUD, boxShadow: `3px 3px 0 ${colors.SHADOW}`, transform: "rotate(-0.4deg)" }}
      >
        <PrintedShade ink={colors.ON_LOUD} strength={22} from={25} />
        <div className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            className={`${LETTERED} comic-outline-text text-xl uppercase leading-none`}
            style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", ["--comic-title-fill" as string]: colors.TITLE_FILL, ["--comic-title-stroke" as string]: colors.TITLE_STROKE }}
          >
            The Bingo starts in
          </span>
          <time dateTime={new Date(startsAt).toISOString()} className="flex items-center gap-1.5" aria-label={`The Bingo starts in ${formatDuration(remaining)}`}>
            {countdownUnits(remaining).map((unit) => (
              <span
                key={unit.label}
                className={`${LETTERED} inline-flex items-baseline gap-1 border-2 px-1.5 py-0.5 leading-none`}
                style={{ fontFamily: COMIC_FONT, borderColor: colors.ON_YELLOW, background: colors.YELLOW, color: colors.ON_YELLOW, boxShadow: `2px 2px 0 ${colors.ON_YELLOW}` }}
              >
                <span className="num text-lg">{unit.value}</span>
                <span className="text-[11px] tracking-wider">{unit.label}</span>
              </span>
            ))}
          </time>
        </div>
        <div className="relative flex min-w-48 flex-1 flex-col text-xs leading-snug">
          <span className="font-semibold">
            <LocalStart startsAt={startsAt} />
          </span>
          <span className="opacity-90">Look over the tiles now — submissions open when the timer hits zero.</span>
        </div>
      </div>
    </div>
  );
}

function FinalStretch({ startsAt, remaining }: { startsAt: number; remaining: number }) {
  const { colors } = useComic();
  return (
    // The starburst spills over the box's top and bottom, so there's room kept for it.
    <div className="mx-auto mb-9 mt-5 max-w-2xl px-1">
      <div
        className="relative border-[3px] px-4 py-3 pr-32 sm:px-5 sm:pr-44"
        // The scouting banner's night-sky blue: the palette's blue deepened with its dark ink, which the light lettering
        // reads well on in every palette.
        style={{ background: `color-mix(in srgb, ${colors.BLUE} 70%, ${colors.ON_YELLOW})`, borderColor: colors.LINE, color: colors.ON_LOUD, boxShadow: `5px 5px 0 ${colors.SHADOW}`, transform: "rotate(-0.8deg)" }}
      >
        {/* The shading in its own clipped layer: the box itself doesn't clip, so the starburst can spill over it. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <PrintedShade ink={colors.ON_LOUD} strength={22} from={25} />
        </div>
        {/* The clock itself is drawn in the burst (aria-hidden), so it's said once here: read every second, a live clock
            would talk over everything else. */}
        <span className="sr-only">The Bingo starts in {formatDuration(remaining)}.</span>
        <div className="relative" aria-hidden>
          <span
            className={`${LETTERED} comic-outline-text text-3xl uppercase leading-none sm:text-4xl`}
            style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", ["--comic-title-fill" as string]: colors.TITLE_FILL, ["--comic-title-stroke" as string]: colors.TITLE_STROKE }}
          >
            The Bingo starts in
          </span>
        </div>
        {/* Pinned to the right edge and centred, bigger than the box is tall: it spills over the top and bottom rather
            than making the box as tall as itself. Tucked in on a phone, where the screen's edge would cut its spikes. */}
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 sm:-right-5">
          <Burst fill={colors.YELLOW} color={colors.ON_YELLOW} rotate={-6} spikes={16} className="w-32 sm:w-40">
            <time dateTime={new Date(startsAt).toISOString()} className="num">
              {formatMinutesSeconds(remaining)}
            </time>
          </Burst>
        </div>
        <div className="relative mt-2 flex flex-col gap-0.5 text-left text-sm">
          <span className="font-semibold">
            <LocalStart startsAt={startsAt} />
          </span>
          <span className="text-[13px] opacity-90">Look over the tiles now — submissions open when the timer hits zero.</span>
        </div>
      </div>
    </div>
  );
}

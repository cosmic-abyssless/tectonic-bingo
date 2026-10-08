import { useCountdown } from "../../../core/ui/CountdownTimer";
import { countdownUnits, FINAL_STRETCH_MS } from "../../../core/ui/startCountdown";
import { formatDuration, formatLocalDateTime, formatMinutesSeconds } from "../../../core/ui/time";
import { COMIC_FONT } from "../font";
import { Burst } from "../ui/Burst";
import { PrintedShade } from "../ui/tones";
import { useComic } from "../ui/useComic";
import { LETTERED } from "../../lettering";

/**
 * The countdown to the start above the Board, as a cover blurb: the scouting banner's night-sky caption, knocked
 * askew, with outlined cover lettering and halftone shading. The time left is a row of inked panels (DAYS, HRS, MIN);
 * in the last ten minutes it's a big minutes-and-seconds clock in a starburst. Under it, when the start is in the
 * player's own time zone, and what to do until then.
 */
export function ComicPreStartBanner({ startsAt }: { startsAt: number }) {
  const { colors } = useComic();
  const remaining = useCountdown(startsAt);
  const finalStretch = remaining <= FINAL_STRETCH_MS;
  const iso = new Date(startsAt).toISOString();

  const title = (size: string) => (
    <span
      className={`${LETTERED} comic-outline-text ${size} uppercase leading-none`}
      style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", ["--comic-title-fill" as string]: colors.TITLE_FILL, ["--comic-title-stroke" as string]: colors.TITLE_STROKE }}
    >
      The Bingo starts in
    </span>
  );

  return (
    <div className="mx-auto mb-5 max-w-2xl px-1">
      <div
        className="relative overflow-hidden border-[3px] px-4 py-3 sm:px-5"
        // The scouting banner's night-sky blue: the palette's blue deepened with its dark ink, which the light lettering
        // reads well on in every palette.
        style={{ background: `color-mix(in srgb, ${colors.BLUE} 70%, ${colors.ON_YELLOW})`, borderColor: colors.LINE, color: colors.ON_LOUD, boxShadow: `5px 5px 0 ${colors.SHADOW}`, transform: "rotate(-0.8deg)" }}
      >
        <PrintedShade ink={colors.ON_LOUD} strength={22} from={25} />
        <div className="relative flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left">
          {finalStretch ? (
            <>
              {/* The clock itself is drawn in the burst (aria-hidden), so it's said once here: read every second, a
                  live clock would talk over everything else. */}
              <span className="sr-only">The Bingo starts in {formatDuration(remaining)}.</span>
              <div className="shrink-0" aria-hidden>
                {title("text-3xl sm:text-4xl")}
              </div>
              <Burst fill={colors.YELLOW} color={colors.ON_YELLOW} rotate={-6} spikes={16} className="w-32 shrink-0 sm:w-36">
                <time dateTime={iso} className="num">
                  {formatMinutesSeconds(remaining)}
                </time>
              </Burst>
            </>
          ) : (
            <>
              <div className="shrink-0">{title("text-2xl sm:text-3xl")}</div>
              <time dateTime={iso} className="flex items-end gap-2" aria-label={`The Bingo starts in ${formatDuration(remaining)}`}>
                {countdownUnits(remaining).map((unit) => (
                  <span
                    key={unit.label}
                    className="flex min-w-14 flex-col items-center border-[3px] px-2 pb-1 pt-1.5"
                    style={{ background: colors.PAPER_RAISED, borderColor: colors.ON_YELLOW, color: colors.INK, boxShadow: `3px 3px 0 ${colors.ON_YELLOW}` }}
                  >
                    <span className={`${LETTERED} num text-3xl leading-none`} style={{ fontFamily: COMIC_FONT }}>
                      {unit.value}
                    </span>
                    <span className={`${LETTERED} mt-0.5 text-[11px] leading-none tracking-wider`} style={{ fontFamily: COMIC_FONT, color: colors.INK_SUBTLE }}>
                      {unit.label}
                    </span>
                  </span>
                ))}
              </time>
            </>
          )}
        </div>
        <div className="relative mt-3 flex flex-col gap-0.5 text-center text-sm sm:text-left">
          <span className="font-semibold">
            Starts <time dateTime={iso}>{formatLocalDateTime(startsAt)}</time>, your local time.
          </span>
          <span className="text-[13px] opacity-90">Look over the tiles now — submissions open when the timer hits zero.</span>
        </div>
      </div>
    </div>
  );
}

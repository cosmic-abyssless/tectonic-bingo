import type { RewindClosingModel } from "../../../headless/types";
import { TitlesSection } from "../../../core/stats/TitlesSection";
import { XIcon } from "../../../core/ui/icons";
import { paperVars } from "../signup/parts";
import { ComicIconButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { COVER } from "../wrapped/coverParts";
import { display, Kicker, Sfx } from "../wrapped/sections/sectionParts-team-bingo";
import { LETTERED } from "../../lettering";
import { BandGround } from "./rewindParts";

/**
 * The closing card, as the last panel of an issue: a printed band in the viewed Team's colour (yellow for the whole
 * Bingo) with "The end" shouted over it and "Final Titles" lettered big, then every Title as the Stats page lists them,
 * on the palette's paper. Tall on a big Bingo, so it scrolls within the room between the header and the dock.
 */
export function RewindClosing({ closing }: { closing: RewindClosingModel }) {
  const { colors } = useComic();
  const accent = closing.team?.color ?? COVER.YELLOW;
  return (
    <div
      role="dialog"
      aria-label="Final Titles"
      className="relative flex max-h-[calc(100dvh-18rem)] w-[min(52rem,calc(100vw-2rem))] flex-col border-[3px]"
      style={{
        ...paperVars(colors),
        background: colors.PAPER,
        borderColor: colors.LINE,
        boxShadow: `8px 8px 0 ${colors.SHADOW}, 8px 8px 0 3px ${colors.YELLOW}`,
      }}
    >
      <div className="relative shrink-0 overflow-hidden border-b-[3px]" style={{ borderColor: colors.LINE }}>
        <BandGround accent={accent} origin="85% 120%" fadeTo="left" />
        <div className="relative flex items-end justify-between gap-3 px-4 pb-3 pt-3 pr-14">
          <div className="min-w-0">
            <Kicker fill={COVER.PAPER_RAISED} tilt={-2} dot={closing.team?.color ?? null}>
              {closing.team ? closing.team.name : "The whole bingo"}
            </Kicker>
            <h2
              className={`${LETTERED} mt-2`}
              style={{
                ...display(40),
                color: COVER.TITLE_FILL,
                WebkitTextStroke: `2px ${COVER.INK}`,
                paintOrder: "stroke fill",
                textShadow: `3px 3px 0 ${COVER.INK}`,
                paddingRight: 6,
              }}
            >
              Final Titles
            </h2>
          </div>
          <Sfx size={30} tilt={-9} className="mb-1 shrink-0 max-sm:hidden">
            The end!
          </Sfx>
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto px-3 pb-4 pt-3">
        <TitlesSection picked={closing.titles} contributions={closing.contributions} womReadAt={closing.womReadAt} note={false} />
      </div>
      <ComicIconButton label="Close" sfx={false} onPress={closing.close} className="absolute right-2.5 top-2.5 size-9">
        <XIcon size={16} />
      </ComicIconButton>
    </div>
  );
}

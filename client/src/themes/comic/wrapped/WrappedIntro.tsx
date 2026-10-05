import type { WrappedIntroModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedSectionArt } from "../../../core/wrapped/WrappedParts";
import { COMIC_FONT } from "../font";
import { COVER, CoverBurst, CoverCaption, CoverGround, CoverMasthead, CoverTitle, coverShadow, coverTitleSize } from "./coverParts";
import { LETTERED } from "../../lettering";

/**
 * The front cover (#419): the Wrapped's Intro, drawn as a comic book cover like the share cards are: a masthead with the
 * Bingo's name, rays and a halftone, the Intro's Category images as the cover stars, the Bingo's name big and inked, and
 * an SFX burst. It is the one panel of its page, which the book opens on, as a Tile's comic book opens on the Board.
 */
export function WrappedIntro({ section, preview }: { section: WrappedIntroModel; preview: boolean }) {
  const images = section.art.images.map(({ frames, name, role }) => (name ? { art: frames, name, role } : frames));
  const hasStars = images.length > 0;
  return (
    <WrappedScene steps={1} className="wrapped-cover">
      <Reveal bare step={0} className="absolute inset-0">
        <div className="relative flex size-full flex-col overflow-hidden" style={{ color: COVER.INK, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
          <CoverGround accent={COVER.BLUE} rays="70% 62%" />
          <CoverMasthead
            kicker={section.playerName ? "Your Bingo Wrapped" : "Bingo Wrapped"}
            flag={
              <div className={`${LETTERED} flex flex-col items-center justify-center px-2.5 text-center uppercase`} style={{ borderLeft: `4px solid ${COVER.INK}`, fontFamily: COMIC_FONT, fontSize: 14, lineHeight: 1, background: COVER.YELLOW }}>
                <span>Final</span>
                <span>issue!</span>
              </div>
            }
          />

          <div className="relative flex flex-1 flex-col px-5 pt-5 pb-4">
            <CoverCaption tilt={-2} fill={COVER.YELLOW} size={17} style={{ alignSelf: "flex-start" }}>
              {preview ? "Moderator's preview" : section.playerName ? "Your year in the Bingo" : "The Bingo, start to finish"}
            </CoverCaption>
            <div className="mt-3">
              <CoverTitle as="h1" size={coverTitleSize(section.bingoName)}>
                {section.bingoName}
              </CoverTitle>
            </div>
            {section.datesLabel && (
              <p className={`${LETTERED} num mt-3 self-start uppercase`} style={{ fontFamily: COMIC_FONT, fontSize: 17, letterSpacing: "0.06em", color: COVER.ON_LOUD, textShadow: coverShadow(2) }}>
                {section.datesLabel}
              </p>
            )}

            {/* The stars of the cover stand on its foot, over the rays. */}
            <div className="relative flex min-h-0 flex-1 items-end justify-center">
              {hasStars ? (
                <div className="w-full [&>div]:mb-0 [&_.font-osrs]:text-[16px]" style={{ ["--color-on-surface-subtle" as string]: COVER.ON_LOUD }}>
                  <WrappedSectionArt art={images} />
                </div>
              ) : (
                <CoverBurst size={200} tilt={-6}>
                  <span style={{ fontSize: 34 }}>Wrapped!</span>
                </CoverBurst>
              )}
              {hasStars && (
                <div className="absolute top-1 right-0">
                  <CoverBurst size={104} tilt={9} fill={COVER.RED}>
                    <span style={{ fontSize: 26, color: COVER.ON_LOUD }}>It's</span>
                    <span style={{ fontSize: 28, color: COVER.ON_LOUD }}>over!</span>
                  </CoverBurst>
                </div>
              )}
            </div>
            {section.art.credits.length > 0 && (
              <ul aria-label="Credits" className="relative mt-3 flex flex-wrap justify-center gap-2">
                {section.art.credits.map((credit, i) => (
                  <li key={i}>
                    <CoverCaption size={13} tilt={i % 2 ? 1 : -1}>
                      {credit.role ? `${credit.role}: ` : ""}
                      {credit.name}
                    </CoverCaption>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`${LETTERED} relative shrink-0 px-4 py-2.5 text-center uppercase`} style={{ background: COVER.PAPER_RAISED, borderTop: `4px solid ${COVER.INK}`, fontFamily: COMIC_FONT, fontSize: 19, lineHeight: 1.1, letterSpacing: "0.03em" }}>
            {section.playerName ? `It's over, ${section.playerName}. Let's look back.` : "It's over. Let's look back."}
            <span className="mt-1 block text-[13px]" style={{ color: COVER.INK_SUBTLE, letterSpacing: "0.08em" }}>
              {preview ? "Only Moderators can see this until it's published" : "Turn the page to open it"}
            </span>
          </div>
        </div>
      </Reveal>
    </WrappedScene>
  );
}

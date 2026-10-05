import type { ReactNode } from "react";
import type { WrappedOutroModel } from "../../../headless/types";
import { Reveal, WrappedScene } from "../../../core/wrapped/Scene";
import { WrappedShareCardItem } from "../../../core/wrapped/ShareCards";
import { WrappedCategoryArt } from "../../../core/wrapped/WrappedParts";
import { RewindIcon } from "../../../core/ui/icons";
import { useSlot } from "../../context";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { COVER, CoverCaption, CoverGround, CoverTitle, coverShadow } from "./coverParts";
import { LETTERED } from "../../lettering";

/**
 * The back cover (#419): the Outro, as the cover of the book's last page. A "That's a wrap" panel with the credits, then
 * Rewind and the Board as "next issue" teasers. The viewer's share cards follow it, a page each, each with its Copy image,
 * Download and Share buttons (and, in a Moderator's preview, the "Preview" watermark every card carries).
 */
export function WrappedOutro({ section, preview, onRewind, onBoard }: { section: WrappedOutroModel; preview: boolean; onRewind: () => void; onBoard: () => void }) {
  const ShareCard = useSlot("WrappedShareCard");
  const hasCredits = section.art.credits.length > 0 || section.art.images.some((image) => image.name);
  return (
    <>
      <WrappedScene steps={3} className="wrapped-back">
        <CoverGround accent={COVER.RED} rays="30% 40%" />
        <Reveal step={0} className="wrapped-back-panel">
          <div className="text-center">
            {hasCredits && (
              <p className={`${LETTERED} mb-2 uppercase`} style={{ fontFamily: COMIC_FONT, fontSize: 14, letterSpacing: "0.12em", color: "var(--comic-ink)" }}>
                Brought to you by
              </p>
            )}
            <div className="[&>div]:mb-3 [&>ul]:mb-3">
              <WrappedCategoryArt art={section.art} />
            </div>
            <CoverTitle size={50}>That's a wrap!</CoverTitle>
            <p className="mt-2 text-[15px]" style={{ color: "var(--comic-ink)" }}>
              Thanks for playing {section.bingoName}. See you at the next one.
            </p>
          </div>
        </Reveal>
        <Reveal step={1} className="wrapped-back-panel">
          <Teaser tag="Next issue" title="The replay" blurb="Watch the whole Bingo play out again, hour by hour." button="Watch the replay" icon={<RewindIcon />} variant="primary" onPress={onRewind} />
        </Reveal>
        <Reveal step={2} className="wrapped-back-panel">
          <Teaser tag="Also in stores" title="The Board" blurb="Back to where it all happened." button="Back to the Board" onPress={onBoard} />
        </Reveal>
      </WrappedScene>
      {section.cards.map((card) => (
        <WrappedScene key={card.key} steps={1}>
          <Reveal step={0} className="w-full">
            <p className={`${LETTERED} mb-3 text-center uppercase`} style={{ fontFamily: COMIC_FONT, fontSize: 21, letterSpacing: "0.05em", color: "var(--comic-ink)" }}>
              Share your {card.label}
            </p>
            <WrappedShareCardItem card={card} preview={preview} Card={ShareCard} />
          </Reveal>
        </WrappedScene>
      ))}
    </>
  );
}

/** A "next issue" teaser: a tag, the title, a line, and the button that gets there. */
function Teaser({ tag, title, blurb, button, icon, variant = "secondary", onPress }: { tag: string; title: string; blurb: string; button: string; icon?: ReactNode; variant?: "primary" | "secondary"; onPress: () => void }) {
  const { colors } = useComic();
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <CoverCaption tilt={-2} fill={COVER.YELLOW} size={13} style={{ display: "inline-block", boxShadow: coverShadow(2) }}>
          {tag}
        </CoverCaption>
        <p className={`${LETTERED} mt-2 uppercase leading-none`} style={{ fontFamily: COMIC_FONT, fontSize: 30, letterSpacing: "0.03em", color: colors.INK }}>
          {title}
        </p>
        <p className="mt-1 text-[14px]" style={{ color: colors.INK_BODY }}>
          {blurb}
        </p>
      </div>
      <ComicButton variant={variant} size="md" onPress={onPress} className="shrink-0">
        {icon}
        {button}
      </ComicButton>
    </div>
  );
}

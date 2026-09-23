import { StarIcon } from "../../../core/ui/icons";
import { pageColors } from "../board/colors";
import { COMIC_FONT } from "../font";
import { CaptionBox } from "../ui/CaptionBox";
import { ComicButton } from "../ui/ComicButton";
import { PageColorsContext, useComic } from "../ui/useComic";

/**
 * The nudge a team lead gets while signups are open (or captains are being picked): scout the players before the
 * draft. A comic caption box, tilted a hair like the rest of the page's call-outs, printed on the same stock as the
 * tile modal's book pages (the papyrus in dark mode): everything inside draws in the page palette, as on a book page.
 */
export function ScoutBanner({ onOpen }: { onOpen: () => void }) {
  const { colors } = useComic();
  const page = pageColors(colors);
  return (
    <PageColorsContext.Provider value={page}>
      <ScoutCaption onOpen={onOpen} paper={page.PAPER} />
    </PageColorsContext.Provider>
  );
}

function ScoutCaption({ onOpen, paper }: { onOpen: () => void; paper: string }) {
  const { colors } = useComic();
  return (
    <CaptionBox tilt={-0.6} className="mx-auto mb-6 max-w-lg" style={{ background: paper }}>
      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xl uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", color: colors.INK }}>
            <StarIcon size={18} />
            Scout the signups!
          </div>
          <p className="mt-1 text-sm" style={{ color: colors.INK_BODY }}>
            Star and note players now, so your picks are ready when the draft starts.
          </p>
        </div>
        <ComicButton variant="yellow" size="sm" tilt={1} onPress={onOpen}>
          Open scouting room
        </ComicButton>
      </div>
    </CaptionBox>
  );
}

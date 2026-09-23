import { StarIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { CaptionBox } from "../ui/CaptionBox";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";

/**
 * The nudge a team lead gets while signups are open (or captains are being picked): scout the players before the
 * draft. A comic caption box, tilted a hair like the rest of the page's call-outs, rather than the default theme's
 * plain info notice.
 */
export function ScoutBanner({ onOpen }: { onOpen: () => void }) {
  const { colors } = useComic();
  return (
    <CaptionBox tone="yellow" tilt={-0.6} className="mx-auto mb-6 max-w-lg">
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

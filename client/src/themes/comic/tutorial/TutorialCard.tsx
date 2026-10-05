import type { TutorialCardModel } from "../../../headless/types";
import { PointerClickIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { CaptionBox, InkTag } from "../ui/CaptionBox";
import { ComicButton } from "../ui/ComicButton";
import { useThemeVarsInPortal } from "../ui/ComicDialog";
import { useComic } from "../ui/useComic";
import { LETTERED, letteringClasses } from "../../lettering";

/**
 * The Tutorial's card (the TutorialCard slot): a narration caption box, its step count in the corner, Skip (Exit once
 * under way) and Next under it. A step that waits for a click says it's the Player's turn, in red ink, instead of Next.
 */
export function TutorialCard({ card }: { card: TutorialCardModel }) {
  const { colors } = useComic();
  // Portalled to body with the overlay, so the comic's vars are put back on it.
  const portalVars = useThemeVarsInPortal();
  return (
    <div className={letteringClasses(portalVars)} style={portalVars}>
      {/* The welcome (large) is lettered bigger, in a roomier box. */}
      <CaptionBox
        tone="yellow"
        className={card.large ? "px-5 py-4" : undefined}
        title={
          <span className="flex items-baseline justify-between gap-3">
            <span className={card.large ? "text-3xl leading-tight" : undefined}>{card.title}</span>
            <span className="num shrink-0 text-sm" style={{ color: colors.INK_SUBTLE }}>
              {card.label} of {card.count}
            </span>
          </span>
        }
      >
        <div className={`space-y-1 ${card.large ? "mt-2 text-base" : "text-sm"}`}>
          {card.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className={`${LETTERED} mt-3 flex items-center justify-end gap-2`} style={{ fontFamily: COMIC_FONT }}>
          <ComicButton size="sm" variant="ghost" sfx={false} onPress={card.onSkip}>
            {card.skipLabel}
          </ComicButton>
          {card.waitsForClick && (
            <InkTag fill={colors.RED} color={colors.ON_LOUD} className="!py-1">
              <PointerClickIcon />
              Your turn: click it
            </InkTag>
          )}
          {card.primary && (
            <ComicButton size="sm" variant="primary" sfx={false} onPress={card.primary.onPress}>
              {card.primary.label}
            </ComicButton>
          )}
        </div>
      </CaptionBox>
    </div>
  );
}

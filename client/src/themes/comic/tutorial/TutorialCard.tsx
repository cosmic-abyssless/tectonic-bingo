import type { TutorialCardModel } from "../../../headless/types";
import { COMIC_FONT } from "../font";
import { CaptionBox } from "../ui/CaptionBox";
import { ComicButton } from "../ui/ComicButton";
import { useThemeVarsInPortal } from "../ui/ComicDialog";
import { useComic } from "../ui/useComic";

/** The Tutorial's card (the TutorialCard slot): a narration caption box, its step count in the corner, Skip and Next under it. */
export function TutorialCard({ card }: { card: TutorialCardModel }) {
  const { colors } = useComic();
  // Portalled to body with the overlay, so the comic's vars are put back on it.
  const portalVars = useThemeVarsInPortal();
  return (
    <div style={portalVars}>
      <CaptionBox
        tone="yellow"
        title={
          <span className="flex items-baseline justify-between gap-3">
            {card.title}
            <span className="num shrink-0 text-sm" style={{ color: colors.INK_SUBTLE }}>
              {card.number} of {card.count}
            </span>
          </span>
        }
      >
        <div className="space-y-1 text-sm">
          {card.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2" style={{ fontFamily: COMIC_FONT }}>
          <ComicButton size="sm" variant="ghost" sfx={false} onPress={card.onSkip}>
            Skip
          </ComicButton>
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

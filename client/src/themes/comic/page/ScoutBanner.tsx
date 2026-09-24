import type { CSSProperties } from "react";
import { WikiIcon } from "../../../core/ui/ItemIcon";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";

/**
 * The nudge a team lead gets while signups are open (or captains are being picked): scout the players before the
 * draft. Loud on purpose, so it reads as a call to action rather than another panel of the form under it (which is
 * printed on the book-page paper): a process-blue caption, knocked askew, with outlined cover lettering, a halftone
 * shading and a red button. Blue stands out from both the light palette's yellow page and the dark palettes' papyrus
 * sheets.
 */
export function ScoutBanner({ onOpen }: { onOpen: () => void }) {
  const { colors } = useComic();
  return (
    <div className="mx-auto mb-8 mt-2 max-w-lg">
      <div
        className="relative overflow-hidden border-[3px] px-4 py-3"
        // The palette's blue deepened with 30% of its dark ink: a night-sky blue that the light lettering reads well on
        // (the dark palettes' own blue is bright enough that it didn't).
        style={{ background: `color-mix(in srgb, ${colors.BLUE} 70%, ${colors.ON_YELLOW})`, borderColor: colors.LINE, color: colors.ON_LOUD, boxShadow: `6px 6px 0 ${colors.LINE}`, transform: "rotate(-1.2deg)" }}
      >
        {/* Printed shading: dots of the lettering's own colour, faint, fading in towards the right (the mask only reads currentColor's alpha). */}
        <div
          aria-hidden
          className="comic-shade pointer-events-none absolute inset-0"
          style={
            {
              "--comic-shade-ink": `color-mix(in srgb, ${colors.ON_LOUD} 22%, transparent)`,
              maskImage: "linear-gradient(to right, transparent 25%, currentColor)",
              WebkitMaskImage: "linear-gradient(to right, transparent 25%, currentColor)",
            } as CSSProperties
          }
        />
        {/* Stacked on a phone (the button under the text, rather than squeezing it to a few words a line), side by
            side from sm up. */}
        <div className="relative flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 sm:flex-1">
            <div className="flex items-center gap-2">
              {/* The wiki's Spyglass, at its own 31x29 so the pixel art stays crisp. */}
              <WikiIcon name="Spyglass" className="h-[29px] w-[31px] [image-rendering:pixelated]" />
              <span
                className="comic-outline-text text-3xl uppercase leading-none"
                style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", ["--comic-title-fill" as string]: colors.TITLE_FILL, ["--comic-title-stroke" as string]: colors.TITLE_STROKE }}
              >
                Scout the signups!
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold">Star and note players now, so your picks are ready when the draft starts.</p>
          </div>
          {/* Outlined in the dark ink the palettes keep for lettering on bright fills, not the line colour: in a dark
              palette the line is light grey, which barely shows against the blue. --comic-line covers the hover and
              press shadows too. */}
          <ComicButton
            variant="primary"
            size="md"
            tilt={2}
            onPress={onOpen}
            style={{ borderColor: colors.ON_YELLOW, boxShadow: `3px 3px 0 ${colors.ON_YELLOW}`, ["--comic-line" as string]: colors.ON_YELLOW }}
          >
            Open scouting room
          </ComicButton>
        </div>
      </div>
    </div>
  );
}

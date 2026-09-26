import { COMIC_FONT } from "../font";
import { useComic } from "./useComic";

/** "Beta" as a small inked tag on the palette's purple, deepened, after the heading. */
export function ComicBetaTag() {
  const { colors } = useComic();
  return (
    <span
      className="inline-flex items-center border-2 px-1.5 py-px text-sm uppercase leading-none"
      style={{ fontFamily: COMIC_FONT, letterSpacing: "0.04em", borderColor: colors.LINE, background: `color-mix(in srgb, ${colors.PURPLE} 70%, #000)`, color: colors.ON_LOUD, boxShadow: `2px 2px 0 ${colors.LINE}`, transform: "rotate(-3deg)" }}
    >
      Beta
    </span>
  );
}

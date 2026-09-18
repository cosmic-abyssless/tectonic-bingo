import type { CSSProperties } from "react";
import { useResolvedColorScheme } from "../../../core/ui/colorScheme";
import { getColors, type ComicColors } from "../board/colors";

/** The current scheme's palette plus the CSS vars comic.css reads. */
export function useComic(): { colors: ComicColors; vars: CSSProperties; scheme: "light" | "dark" } {
  const scheme = useResolvedColorScheme();
  const colors = getColors(scheme);
  return { colors, scheme, vars: comicVars(colors) };
}

export function comicVars(c: ComicColors): CSSProperties {
  return {
    "--comic-ink": c.INK,
    "--comic-line": c.LINE,
    "--comic-on-yellow": c.ON_YELLOW,
    "--comic-title-fill": c.TITLE_FILL,
    "--comic-title-stroke": c.TITLE_STROKE,
    "--comic-paper": c.PAPER,
    "--comic-paper-raised": c.PAPER_RAISED,
    "--comic-cyan": c.CYAN,
    "--comic-magenta": c.MAGENTA,
    "--comic-yellow": c.YELLOW,
    "--comic-red": c.RED,
    "--comic-halftone-ink": c.HALFTONE,
    "--comic-ray": c.RAY,
    "--comic-shade-ink": c.SHADE,
  } as CSSProperties;
}

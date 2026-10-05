import type { CSSProperties } from "react";

// Marker classes for elements lettered by an inline style. comic.css pins lettered text to its one weight (and gives
// a truncated line of Bangers room for its lean) by these classes, not by matching the style attribute: a selector
// with [style*=…] left of a combinator makes the browser restyle an element's whole subtree whenever that element's
// style attribute changes, and animations write inline styles every frame (#470). So any element whose inline style
// letters it must carry the matching class too.

/** On an element whose inline style names Bangers (COMIC_FONT), whether as its font or in a CSS variable. */
export const LETTERED = "lettered";

/** On an element whose inline style sets or reads the theme's heading font (--font-heading, e.g. core/ui/Card's HEADING_FONT). */
export const HEADING_LETTERED = "heading-lettered";

/** The marker classes an inline style needs, for a style built at runtime (e.g. a theme's CSS variables). */
export function letteringClasses(style: CSSProperties | undefined): string {
  if (!style) return "";
  const text = JSON.stringify(style);
  return [text.includes("Bangers") && LETTERED, text.includes("--font-heading") && HEADING_LETTERED].filter(Boolean).join(" ");
}

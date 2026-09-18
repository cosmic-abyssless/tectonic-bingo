import type { CSSProperties } from "react";
import { COMIC_FONT } from "../font";

/**
 * Props for core/ui AppHeader that turn it into a comic masthead: yellow
 * paper, thick ink rule with a hard shadow, Bangers title. Shared by the
 * Draft/Stats layouts and the board PageHeader.
 */
export function comicHeaderProps(): { className: string; titleClassName: string; style: CSSProperties } {
  return {
    className: "comic-masthead !bg-background !border-b-[3px] !backdrop-blur-none",
    // The title box is `truncate` (overflow hidden) and only as wide as the
    // text's advance width. Bangers leans right, so its last glyph overhangs
    // that by up to ~0.17em, plus the 0.08em drop shadow: pad for both so
    // nothing gets sliced. Same idea below for descenders + shadow.
    titleClassName: "comic-outline-text !text-2xl max-md:!text-lg !text-white uppercase tracking-wide pr-[0.3em] pb-[0.15em] -mb-[0.15em]",
    style: { fontFamily: COMIC_FONT, boxShadow: "0 4px 0 var(--comic-ink, #0b0b0d)" } as CSSProperties,
  };
}

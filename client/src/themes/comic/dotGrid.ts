import type { CSSProperties } from "react";
import { useResolvedColorScheme } from "../../core/ui/colorScheme";

// Ben-Day dot shading over the page background — the classic comic-book
// halftone texture. A repeating radial-gradient is the cheapest way to get
// a dot grid in CSS: each "tile" of the background is one dot on a
// transparent field, then `backgroundSize` sets the grid spacing.
//
// The dot color needs a light/dark pair: a semi-transparent black dot is
// invisible against comic-dark's purple background, so dark gets a pale
// lavender dot instead.
export function useDotGridStyle(): CSSProperties {
  const scheme = useResolvedColorScheme();
  const dot = scheme === "dark" ? "#c4b5fd66" : "#00000080";
  return {
    backgroundColor: "var(--color-background)",
    backgroundImage: `radial-gradient(${dot}, 15%, transparent 16%), radial-gradient(${dot}, 15%, transparent 16%)`,
    backgroundSize: "14px 14px",
    backgroundPosition: "0 0, 7px 7px",
    position: "relative",
    zIndex: 1,
  };
}

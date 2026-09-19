import { useEffect, type ReactNode } from "react";
import { Halftone, usePageStyle } from "./Halftone";
import { SfxLayer } from "./SfxLayer";

/** Page root for every comic page: printed background + SFX layer. Children sit above the halftone. */
export function ComicPage({ children }: { children: ReactNode }) {
  const style = usePageStyle();
  // A board that fits the screen has nothing to scroll, but iOS still lets the page
  // rubber-band (and flashes a scroll indicator) when you drag it. Switch the bounce off
  // at the root while a comic page is up; scrolling itself is untouched. (It also
  // turns off pull-to-refresh on these pages, which the live board doesn't need.)
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "none";
    return () => {
      root.style.overscrollBehaviorY = previous;
    };
  }, []);
  return (
    // overflow-y: clip (not hidden — no scroll container, so the sticky
    // header still sticks): each tile's book frame is laid out ~35% of a tile
    // taller than the tile and only VISUALLY cropped (clip-path), so the last
    // row's frames would otherwise stretch the document past this yellow
    // root and show the bare body colour as a strip under the board.
    <div className="relative min-h-dvh overflow-y-clip text-on-surface" style={style}>
      <Halftone />
      <div className="relative z-[1]">{children}</div>
      <SfxLayer />
    </div>
  );
}

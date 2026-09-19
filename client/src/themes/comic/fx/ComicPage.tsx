import type { ReactNode } from "react";
import { Halftone, usePageStyle } from "./Halftone";
import { SfxLayer } from "./SfxLayer";

/** Page root for every comic page: printed background + SFX layer. Children sit above the halftone. */
export function ComicPage({ children }: { children: ReactNode }) {
  const style = usePageStyle();
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

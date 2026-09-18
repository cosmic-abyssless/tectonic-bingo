import type { ReactNode } from "react";
import { Halftone, usePageStyle } from "./Halftone";
import { SfxLayer } from "./SfxLayer";

/** Page root for every comic page: printed background + SFX layer. Children sit above the halftone. */
export function ComicPage({ children }: { children: ReactNode }) {
  const style = usePageStyle();
  return (
    <div className="relative min-h-screen text-on-surface" style={style}>
      <Halftone />
      <div className="relative z-[1]">{children}</div>
      <SfxLayer />
    </div>
  );
}

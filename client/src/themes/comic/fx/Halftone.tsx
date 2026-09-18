import type { CSSProperties } from "react";
import { useComic } from "../ui/useComic";

/**
 * Full-page printed background: flat process color with two halftone dot
 * layers whose density grows toward the edges (a vignette), plus faint rays
 * from the top. Fixed-position so it stays put under scrolling content.
 */
export function Halftone() {
  const { colors, vars, scheme } = useComic();
  return (
    <div aria-hidden style={vars}>
      <div className="comic-halftone" style={{ ["--comic-halftone-opacity" as string]: scheme === "dark" ? 0.35 : 0.5 } as CSSProperties} />
      <div className="comic-halftone comic-halftone-fine" />
      <div
        className="comic-rays pointer-events-none fixed left-1/2 top-0 z-0 size-[220vmax] -translate-x-1/2 -translate-y-1/2"
        style={{ ["--comic-ray" as string]: colors.RAY, maskImage: "radial-gradient(circle at 50% 50%, #000 0, transparent 55%)", WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 0, transparent 55%)" } as CSSProperties}
      />
      <div className="pointer-events-none fixed inset-0 z-0" style={{ boxShadow: `inset 0 0 120px ${colors.SCRIM}55` }} />
    </div>
  );
}

/** Page root style: flat paper/yellow behind the halftone layers. */
export function usePageStyle(): CSSProperties {
  const { vars } = useComic();
  return { backgroundColor: "var(--color-background)", ...vars };
}

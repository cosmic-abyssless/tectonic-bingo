import { useEffect, useState, type CSSProperties } from "react";
import { useComic } from "../ui/useComic";
import { screenHalftone } from "./halftoneSheet";

/**
 * The viewport's halftone vignette (screenHalftone) as a mask image, drawn again once a resize settles. Null until
 * there's a canvas to draw it on.
 */
export function useScreenHalftone(): string | null {
  const [url, setUrl] = useState(screenHalftone);
  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(settle);
      settle = setTimeout(() => setUrl(screenHalftone()), 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return url;
}

/** A `comic-halftone` layer's style: its dots (`url`, from useScreenHalftone), and anything else it's given. */
export function halftoneLayerStyle(url: string, style: CSSProperties = {}): CSSProperties {
  return { maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")`, ...style };
}

/**
 * Full-page printed background: flat process color with a halftone whose dots grow toward the edges (a vignette),
 * plus faint rays from the top. Fixed-position so it stays put under scrolling content.
 */
export function Halftone() {
  const { colors, vars, scheme } = useComic();
  const dots = useScreenHalftone();
  return (
    <div aria-hidden style={vars}>
      {dots && <div className="comic-halftone" style={halftoneLayerStyle(dots, { ["--comic-halftone-opacity" as string]: scheme === "dark" ? 0.35 : 0.5 } as CSSProperties)} />}
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

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { animate, useReducedMotion } from "motion/react";
import type { WrappedRevealProps } from "../../../core/wrapped/sceneProgress";
import { BRUSH_SIZE, brushMaskUrl, brushPosition } from "./brush";

/** How long the brush takes to paint a panel in (s), and its easing: it picks up speed, then slows through the bristles. */
const BRUSH_SECONDS = 0.8;
const BRUSH_EASE = [0.4, 0.05, 0.25, 1] as const;

/** Which panel the camera is on: the one that is lit while the others on the page are dimmed. Set by the book. */
export interface PanelFocus {
  sceneId: string | null;
  step: number;
}
export const PanelFocusContext = createContext<PanelFocus>({ sceneId: null, step: 0 });

type Paint = "empty" | "painting" | "drawn";

/**
 * Draws `children` under a brush stroke: invisible while `revealed` is false; when it turns true the stroke sweeps over it
 * and leaves it drawn. Already revealed when it first appears, it's simply drawn. With reduced motion it is drawn
 * outright, with no stroke.
 */
export function BrushReveal({ revealed, className, children }: { revealed: boolean; className?: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [paint, setPaint] = useState<Paint>(revealed ? "drawn" : "empty");
  const brush = useRef<{ stop(): void } | null>(null);

  // Before paint, so the first frame of the stroke is the empty one and the content is never seen whole first.
  useLayoutEffect(() => {
    if (!revealed) {
      brush.current?.stop();
      setPaint("empty");
      return;
    }
    if (paint !== "empty") return;
    if (reduceMotion) {
      setPaint("drawn");
      return;
    }
    setPaint("painting");
  }, [revealed, reduceMotion, paint]);

  useEffect(() => {
    if (paint !== "painting") return;
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--brush-position", `${brushPosition(0)}%`);
    const controls = animate(0, 1, {
      duration: BRUSH_SECONDS,
      ease: BRUSH_EASE,
      onUpdate: (t) => el.style.setProperty("--brush-position", `${brushPosition(t)}%`),
      onComplete: () => setPaint("drawn"),
    });
    brush.current = controls;
    return () => controls.stop();
  }, [paint]);

  const style: CSSProperties =
    paint === "drawn"
      ? {}
      : paint === "empty"
        ? { visibility: "hidden" }
        : {
            ["--brush-position" as string]: `${brushPosition(0)}%`,
            maskImage: brushMaskUrl(),
            WebkitMaskImage: brushMaskUrl(),
            maskSize: `${BRUSH_SIZE * 100}% 100%`,
            WebkitMaskSize: `${BRUSH_SIZE * 100}% 100%`,
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "var(--brush-position) 0%",
            WebkitMaskPosition: "var(--brush-position) 0%",
          };
  return (
    <div ref={ref} className={className} style={style} data-paint={paint}>
      {children}
    </div>
  );
}

/**
 * A Reveal drawn as a comic panel: an inked frame that is empty until the camera arrives, then painted in by the brush
 * stroke. The section's classes lay the panel out on its page. A `bare` Reveal brings its own frame (a cover), so only the
 * brush is applied.
 */
export function ComicReveal({ sceneId, step, revealed, bare, className, children }: WrappedRevealProps) {
  const focus = useContext(PanelFocusContext);
  const focused = focus.sceneId === sceneId && focus.step === step;
  return (
    <div className={`wrapped-panel ${bare ? "wrapped-panel-bare" : ""} ${className ?? ""}`} data-wrapped-step={step} data-revealed={revealed} data-focused={focused} data-bare={bare}>
      <BrushReveal revealed={revealed} className="wrapped-panel-content">
        {children}
      </BrushReveal>
    </div>
  );
}

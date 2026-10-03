import { useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { WrappedRevealProps } from "../../../core/wrapped/sceneProgress";

// A Reveal drawn as a comic panel. Until the camera reaches it, it is a frame pencilled in on the page and nothing more.
// When the camera arrives it is drawn in, in beats: the ink goes over the pencil, the colour lands a little off register
// and settles, then what the panel says lands a piece at a time, each by its `data-beat` (sectionParts: a title slams in,
// a sound effect pops, a caption rises). Its frame's shape (a slanted quad) is the book's to give: BookController clips
// the panel to it and draws the frame's lines along it.

/** How the beats are paced (ms): the ink, the colour landing after it, and each beat after that. */
const INK_MS = 170;
const COLOUR_AT = 110;
const COLOUR_MS = 260;
const BEATS_AT = 330;
const BEAT_GAP = 140;

/** The beats a piece of a panel lands with: how it moves in (it fades in over the first part of it as well). */
const BEATS: Record<string, { frames: Keyframe[]; ms: number; easing: string }> = {
  slam: {
    frames: [
      { transform: "scale(2.4) rotate(-6deg)" },
      { transform: "scale(0.92) rotate(1deg)", offset: 0.55, easing: "steps(2, end)" },
      { transform: "none" },
    ],
    ms: 320,
    easing: "cubic-bezier(.2, .9, .3, 1.2)",
  },
  pop: {
    frames: [
      { transform: "scale(0) rotate(-22deg)" },
      { transform: "scale(1.2) rotate(4deg)", offset: 0.65 },
      { transform: "none" },
    ],
    ms: 320,
    easing: "cubic-bezier(.2, .9, .3, 1.2)",
  },
  rise: {
    frames: [
      { transform: "translateY(22px)" },
      { transform: "none" },
    ],
    ms: 220,
    easing: "steps(3, end)",
  },
};

/** Draws a panel in, beat by beat (Web Animations; a browser without them just shows it). */
function drawIn(panel: HTMLElement) {
  if (typeof panel.animate !== "function") return;
  const hold = { fill: "backwards" } as const;
  panel.querySelector<SVGElement>(":scope > .wrapped-panel-frame .wrapped-panel-ink")?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: INK_MS, easing: "ease-out", ...hold });
  const content = panel.querySelector<HTMLElement>(":scope > .wrapped-panel-content");
  if (!content) return;
  content.animate(
    [
      { opacity: 0, transform: "translate(8px, -6px)", filter: "drop-shadow(7px 0 0 #00a3dd) drop-shadow(-7px 0 0 #e4007c)" },
      { opacity: 1, transform: "translate(3px, -2px)", filter: "drop-shadow(3px 0 0 #00a3dd) drop-shadow(-3px 0 0 #e4007c)", offset: 0.5 },
      { opacity: 1, transform: "none", filter: "none" },
    ],
    { duration: COLOUR_MS, delay: COLOUR_AT, easing: "steps(3, end)", ...hold },
  );
  content.querySelectorAll<HTMLElement>("[data-beat]").forEach((el, i) => {
    const beat = BEATS[el.dataset.beat ?? ""];
    if (!beat) return;
    const delay = BEATS_AT + i * BEAT_GAP;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: beat.ms * 0.35, delay, ...hold });
    // The move is added to what the piece already has (a tilt), so it lands at its own angle.
    el.animate(beat.frames, { duration: beat.ms, delay, easing: beat.easing, composite: "add", ...hold });
  });
}

type Ink = "pencil" | "inked";

/**
 * The comic book's Reveal (WrappedProgressProvider's `reveal`). The section's classes lay the panel out on its page. A
 * `bare` Reveal brings its own frame (a cover), so it gets no frame, only the beats.
 */
export function ComicReveal({ step, revealed, bare, emphasis, className, children }: WrappedRevealProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Already reached when it first appears (a page already passed), it is simply drawn.
  const [ink, setInk] = useState<Ink>(revealed ? "inked" : "pencil");

  // Before paint, so the first frame of the beats is the empty one and the content is never seen whole first.
  useLayoutEffect(() => {
    if (!revealed) {
      setInk("pencil");
      return;
    }
    if (ink === "inked") return;
    setInk("inked");
    if (!reduceMotion && ref.current) drawIn(ref.current);
  }, [revealed, reduceMotion, ink]);

  return (
    <div ref={ref} className={`wrapped-panel ${bare ? "wrapped-panel-bare" : ""} ${className ?? ""}`} data-wrapped-step={step} data-revealed={revealed} data-ink={ink} data-bare={bare} data-emphasis={emphasis}>
      {!bare && <span aria-hidden className="wrapped-panel-paper" />}
      {/* Hidden two ways: a part that makes itself visible (a share card, once it has measured itself) still can't show. */}
      <div className="wrapped-panel-content" style={ink === "pencil" ? { visibility: "hidden", opacity: 0 } : undefined}>
        {children}
      </div>
      {!bare && (
        <svg aria-hidden className="wrapped-panel-frame">
          <polygon className="wrapped-panel-pencil" />
          <polygon className="wrapped-panel-ink" pathLength={1} />
        </svg>
      )}
    </div>
  );
}

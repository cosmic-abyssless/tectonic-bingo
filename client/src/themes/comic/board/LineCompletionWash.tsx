import { memo } from "react";
import { linePulseDelayMs, lineWashLayers, type LinePulseStop } from "./linePulse";

/**
 * Starts a layer's pulse at the document timeline's zero, so every layer on
 * the board shares one clock and the delay alone sets its phase
 * (linePulseDelayMs). A layer that mounts later, e.g. when the board's search
 * stops dimming its Tile, joins the wave where its line already is.
 */
function startOnDocumentClock(layer: HTMLDivElement | null) {
  for (const animation of layer?.getAnimations?.() ?? []) animation.startTime = 0;
}

/**
 * A completed line's wash over one of its Tiles: a sine wave of
 * --tile-complete travelling along the line. Pure CSS (comic-line-pulse in
 * comic.css): each layer's gradient is static and only its opacity animates,
 * so the compositor runs it and nothing here re-renders or repaints per frame.
 */
export const LineCompletionWash = memo(function LineCompletionWash({
  stops,
  boostedLineIds,
}: {
  stops: LinePulseStop[];
  boostedLineIds: ReadonlySet<string>;
}) {
  return (
    <>
      {stops.flatMap((stop) =>
        lineWashLayers(stop).map((layer, i) => (
          <div
            key={`${stop.lineId}:${i}`}
            ref={startOnDocumentClock}
            aria-hidden
            className={`comic-line-pulse pointer-events-none absolute inset-0 rounded-lg${boostedLineIds.has(stop.lineId) ? " comic-line-pulse-boost" : ""}`}
            style={{ backgroundImage: layer.backgroundImage, animationDelay: `${linePulseDelayMs(layer.position)}ms` }}
          />
        )),
      )}
    </>
  );
});

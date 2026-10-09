import { forwardRef, useImperativeHandle, useRef, type RefObject } from "react";
import type { WrappedArtFrames } from "@bingo/shared";
import { StickerArt } from "../../../core/wrapped/StickerArt";
import type { DeskGroup } from "./deskLayout";
import type { CameraEffects } from "./BookController";

/** A side image's size on the desk (px, desk coordinates). */
const STICKER_W = 300;
const STICKER_H = 430;

/**
 * The side images, as stickers slapped on the desk between the spreads: one in each gap, taking the side images in turn,
 * centred across it so two never pile onto each other, lying at the angle of the spread before it and a little more, high
 * in one gap and low in the next. They are part of the desk, so the camera shows them as it pulls back from a spread and
 * pans to the next. Wide screens only (the page says when): a phone reads a page at a time, with no room beside it.
 */
export function DeskStickers({ art, groups }: { art: WrappedArtFrames[]; groups: readonly DeskGroup[] }) {
  if (art.length === 0) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute top-0 left-0">
      {groups.slice(0, -1).map((g, n) => {
        const next = groups[n + 1]!;
        // The gap's middle, in this group's coordinates (the next one lies a little turned, so near enough).
        const x = g.w + (next.place.x - g.place.x - g.w - STICKER_W) / 2;
        const high = n % 2 === 0;
        const y = high ? Math.min(40, Math.max(0, g.h - STICKER_H)) : Math.max(0, g.h - STICKER_H - 20);
        const tilt = (high ? -5 : 6) + (n % 3) - 1;
        return (
          <div
            key={n}
            className="absolute top-0 left-0 origin-top-left"
            style={{ width: STICKER_W, height: STICKER_H, transform: `translate(${g.place.x}px, ${g.place.y}px) rotate(${g.place.angle}deg) translate(${x}px, ${y}px) rotate(${tilt}deg)` }}
          >
            <StickerArt frames={art[n % art.length]!} className="size-full" phase={high ? 0 : 0.5} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * What the camera's moves draw over the stage: the impact of a hard cut, a black-and-white flash and a shake of the
 * stage. Driven by the book (CameraEffects) through a ref.
 */
export const CameraFx = forwardRef<CameraEffects, { shake: RefObject<HTMLElement | null> }>(function CameraFx({ shake }, ref) {
  const flash = useRef<HTMLDivElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      impact() {
        const el = flash.current;
        if (el && typeof el.animate === "function") {
          el.animate(
            [
              { opacity: 1, background: "#0b0b0d" },
              { opacity: 1, background: "#0b0b0d", offset: 0.45 },
              { opacity: 1, background: "#ffffff", offset: 0.46 },
              { opacity: 0, offset: 0.9 },
              { opacity: 0 },
            ],
            { duration: 170 },
          );
        }
        shake.current?.animate?.(
          [
            { transform: "translate(0, 0)" },
            { transform: "translate(-14px, 9px)" },
            { transform: "translate(11px, -7px)" },
            { transform: "translate(-5px, 4px)" },
            { transform: "translate(3px, -2px)" },
            { transform: "translate(0, 0)" },
          ],
          { duration: 320, delay: 80, easing: "steps(5, end)" },
        );
      },
    }),
    [shake],
  );
  return <div ref={flash} aria-hidden className="wrapped-flash pointer-events-none absolute inset-0 z-20 opacity-0" />;
});

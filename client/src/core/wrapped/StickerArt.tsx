import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { WrappedArtFrames } from "@bingo/shared";

/** How long each "boil" frame stays up: slow, so the sticker looks hand-made and slightly alive rather than busy. */
export const BOIL_MS = 650;

/**
 * Wrapped art (#262): a section's sticker, its two "boil" frames (the server renders them, different in the tear and
 * the tilt) swapped slowly. Both frames are loaded and stacked, so a swap never waits on the network. The shadow is a
 * CSS drop-shadow, which follows the torn edge. With reduced motion it shows the first frame, still.
 */
export function StickerArt({
  frames,
  className = "",
  frameClassName = "h-full w-auto max-w-full",
  alt = "",
  phase = 0,
}: {
  frames: WrappedArtFrames;
  className?: string;
  /** Sizes the first frame, which sizes the sticker; by default it fills the box's height. */
  frameClassName?: string;
  alt?: string;
  phase?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);
  // `phase` (0–1) delays this sticker's swaps by that share of a frame, so stickers side by side don't boil in step.
  useEffect(() => {
    if (reduceMotion) {
      setFrame(0);
      return;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setFrame((f) => 1 - f);
      timer = setInterval(() => setFrame((f) => 1 - f), BOIL_MS);
    }, BOIL_MS * (1 + (phase % 1)));
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [reduceMotion, phase]);

  return (
    <div className={`relative [filter:drop-shadow(0_6px_10px_rgb(0_0_0/0.3))] ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      {frames.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          // The first frame sizes the sticker: to the box's height with its own width (a box with only a height hugs the art),
          // contained in a box sized both ways, or by `frameClassName` (e.g. only max sizes: as big as fits, up to its
          // own size). The second lies exactly over it.
          className={`object-contain ${i === 0 ? `mx-auto block ${frameClassName}` : "absolute inset-0 size-full"} ${frame === i ? "visible" : "invisible"}`}
        />
      ))}
    </div>
  );
}

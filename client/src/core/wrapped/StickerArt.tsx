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
export function StickerArt({ frames, className = "", alt = "" }: { frames: WrappedArtFrames; className?: string; alt?: string }) {
  const reduceMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduceMotion) {
      setFrame(0);
      return;
    }
    const timer = setInterval(() => setFrame((f) => 1 - f), BOIL_MS);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  return (
    <div className={`relative [filter:drop-shadow(0_6px_10px_rgb(0_0_0/0.3))] ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      {frames.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          className={`block h-full w-full object-contain ${i === 0 ? "" : "absolute inset-0"} ${frame === i ? "visible" : "invisible"}`}
        />
      ))}
    </div>
  );
}

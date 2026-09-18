import { useComic } from "./useComic";

/**
 * The slow-turning sunbeams behind an open modal: rays radiating from the
 * center of a disc sized off the WINDOW (180vmax, the larger viewport
 * dimension — clears the viewport diagonal on any aspect ratio, and scales
 * with a big monitor instead of shrinking to a small circle around the
 * dialog). Just the disc: the caller positions it (centered, in a clipped
 * `fixed`/`absolute` layer) and owns any fade in/out, since the tile modal
 * fades it from its own Motion sequence while dialogs get theirs from the
 * overlay's CSS keyframes.
 *
 * The rays are a `repeating-conic-gradient` (solid, gap, repeat) rather than
 * a drawn shape. A `closest-side` radial mask holds them at full strength
 * near the center (behind the dialog anyway) and fades them gradually over
 * nearly the whole radius, so they stay visible most of the way to the
 * window edges. `mix-blend-mode: screen` reads them as light on the scrim's
 * black rather than flat paint. Rotation is the shared `comic-rays-spin`
 * class, so the small-screen and reduced-motion rules in comic.css apply.
 */
export function ComicBurstRays({ reduceMotion = false }: { reduceMotion?: boolean }) {
  const { colors } = useComic();
  const fade = "radial-gradient(circle closest-side, black 0%, black 18%, transparent 96%)";
  return (
    <div
      aria-hidden
      className={`shrink-0 ${reduceMotion ? "" : "comic-rays-spin"}`}
      style={{
        width: "180vmax",
        aspectRatio: "1",
        borderRadius: "50%",
        background: `repeating-conic-gradient(${colors.BURST} 0deg 7deg, transparent 7deg 18deg)`,
        maskImage: fade,
        WebkitMaskImage: fade,
        opacity: 0.4,
        mixBlendMode: "screen",
      }}
    />
  );
}

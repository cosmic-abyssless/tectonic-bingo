import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ComicColors } from "../board/colors";
import { COMIC_FONT } from "../font";
import { shadeHalftone } from "../fx/halftoneSheet";
import { useComic } from "./useComic";

/**
 * The comic theme's coloured surfaces, one recipe for all of them: a tone is a loud process colour (a tag, a button,
 * a banner) and its tint (the paper a caption box is printed on). The palettes define both; this is where the rest of
 * the recipe lives, so every tinted box, tag and header reads the same in every palette:
 *  - lettering on a loud fill is dark or light by how bright the fill is (white on a neon green doesn't read), and
 *  - a tinted box carries a faint halftone of its loud colour fading in towards the right (PrintedShade).
 */
export type Tone = "yellow" | "orange" | "blue" | "red" | "green" | "cyan";

/** A named tone, or any colour (a team's) given as #rrggbb, whose tint is mixed the way the palettes' tints are. */
export type ToneOrColor = Tone | { color: string };

export function toneColors(c: ComicColors, tone: ToneOrColor): { loud: string; tint: string; onLoud: string } {
  if (typeof tone === "object") {
    // 20% on the raised paper, as the dark palettes' own tints are; a little more on light paper, where 20% of a
    // mid-tone team colour barely shows.
    const tint = `color-mix(in srgb, ${tone.color} ${isDarkPaper(c) ? 20 : 30}%, ${c.PAPER_RAISED})`;
    return { loud: tone.color, tint, onLoud: onFill(c, tone.color) };
  }
  const [loud, tint] = {
    yellow: [c.YELLOW, c.YELLOW_TINT],
    orange: [c.ORANGE, c.ORANGE_TINT],
    blue: [c.BLUE, c.BLUE_TINT],
    red: [c.RED, c.RED_TINT],
    green: [c.GREEN, c.GREEN_TINT],
    cyan: [c.CYAN, c.CYAN_TINT],
  }[tone];
  return { loud, tint, onLoud: onFill(c, loud) };
}

/** Lettering for a loud fill: the dark ink on a bright one, the light lettering on a deep one. */
export function onFill(c: ComicColors, fill: string): string {
  const lum = luminance(fill);
  return lum !== null && lum > 0.3 ? c.ON_YELLOW : c.ON_LOUD;
}

/** Whether this palette's paper is dark (the dark palettes' board and dialogs, not their papyrus book pages). */
export function isDarkPaper(c: ComicColors): boolean {
  const lum = luminance(c.PAPER);
  return lum !== null && lum < 0.2;
}

/** WCAG relative luminance of a #rrggbb colour; null for anything else (a color-mix, a var). */
function luminance(color: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * Printed shading: a halftone of `ink`, nothing up to `from` (a percentage of the width), then dots growing towards the
 * right edge. Lay it as the first child of a `relative` box, with the content after it in its own `relative` wrapper so
 * it paints above. The dots are drawn for the box's width (to the nearest 16px), so they stay round at any size.
 */
export function PrintedShade({ ink, strength = 30, from = 35 }: { ink: string; strength?: number; from?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current!;
    const measure = () => setWidth(Math.ceil(el.clientWidth / 16) * 16);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const dots = width > 0 ? shadeHalftone(width, from) : null;
  const mask = dots?.url ? `url("${dots.url}")` : undefined;
  const maskSize = dots ? `${width}px ${dots.height}px` : undefined;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: `color-mix(in srgb, ${ink} ${strength}%, transparent)`,
        maskImage: mask,
        WebkitMaskImage: mask,
        maskSize,
        WebkitMaskSize: maskSize,
        maskRepeat: "repeat-y",
        WebkitMaskRepeat: "repeat-y",
        maskPosition: "right top",
        WebkitMaskPosition: "right top",
        // Nothing until its dots are drawn: unmasked, it would be a solid block of ink.
        visibility: mask ? undefined : "hidden",
      }}
    />
  );
}

/**
 * A caption box printed on a tone's tint: heavy ink border, hard shadow, the tone's halftone shading, and optionally a
 * label on a loud tag knocked askew over the top edge. The Title groups, the Superlative categories, and anything else
 * that's a titled group of rows on coloured paper.
 */
export function ToneBox({
  tone,
  label,
  children,
  className,
  style,
}: {
  tone: Tone;
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { colors } = useComic();
  const { loud, tint } = toneColors(colors, tone);
  return (
    <section
      className={`relative border-[3px] px-3 ${label !== undefined ? "pb-1 pt-4" : "py-2"} ${className ?? ""}`}
      style={{
        // Room above for the label tag, which sits over the top edge (a margin class loses to a list's space-y).
        marginTop: label !== undefined ? "1.75rem" : undefined,
        background: tint,
        borderColor: colors.LINE,
        boxShadow: `4px 4px 0 ${colors.SHADOW}`,
        color: colors.INK_BODY,
        // Core rows inside read their text colours from these, so they letter in this box's ink, not the page's.
        ["--color-on-surface" as string]: colors.INK,
        ["--color-on-surface-muted" as string]: colors.INK_BODY,
        ["--color-on-surface-subtle" as string]: colors.INK_SUBTLE,
        ...style,
      }}
    >
      {label !== undefined && <ToneTag tone={tone} className="absolute -top-4 left-3 z-[1] text-lg" tilt={-2}>{label}</ToneTag>}
      <PrintedShade ink={loud} />
      {/* Above the shading, which as a positioned layer would otherwise paint over the rows. */}
      <div className="relative">{children}</div>
    </section>
  );
}

/** A label on a tone's loud fill: Bangers, ink border, small hard shadow. */
export function ToneTag({ tone, tilt = 0, className, children }: { tone: Tone; tilt?: number; className?: string; children: ReactNode }) {
  const { colors } = useComic();
  const { loud, onLoud } = toneColors(colors, tone);
  return (
    <h3
      className={`border-2 px-2 py-0.5 uppercase leading-none tracking-wide ${className ?? ""}`}
      style={{ fontFamily: COMIC_FONT, background: loud, borderColor: colors.LINE, color: onLoud, boxShadow: `2px 2px 0 ${colors.SHADOW}`, transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      {children}
    </h3>
  );
}

import { Button as AriaButton, type ButtonProps as AriaButtonProps, type PressEvent } from "react-aria-components";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { COMIC_FONT } from "../font";
import { sfxAt } from "../fx/SfxLayer";
import { useComic } from "./useComic";

export type ComicButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "yellow";
export type ComicButtonSize = "sm" | "md" | "lg";

const SIZE: Record<ComicButtonSize, string> = {
  sm: "h-8 px-3 text-base gap-1.5",
  md: "h-10 px-4 text-lg gap-2",
  lg: "h-12 px-6 text-2xl gap-2.5",
};

export interface ComicButtonProps extends AriaButtonProps {
  variant?: ComicButtonVariant;
  size?: ComicButtonSize;
  children?: ReactNode;
  /** Slight tilt in degrees for a hand-placed look. */
  tilt?: number;
  /** Custom SFX text/options, or false to disable automatic sound burst. */
  sfx?: string | { text?: string; size?: number; fill?: string } | false;
  /**
   * Navigates to a route instead of doing something: rendered as an
   * underlined link (Bangers-lettered, no border or shadow), not a button —
   * so what changes the page reads differently from what acts on it.
   */
  href?: string;
}

/**
 * Bangers-lettered, ink-bordered, hard-shadowed button that presses into its
 * shadow — or, with `href`, an underlined route link in the same lettering.
 */
export function ComicButton({ variant = "secondary", size = "md", tilt = 0, sfx, href, className, style, onPress, ...props }: ComicButtonProps) {
  const { colors } = useComic();

  if (href) {
    return (
      <Link
        to={href}
        className={`comic-link inline-flex items-center justify-center gap-2 whitespace-nowrap uppercase leading-none ${SIZE[size]} ${className ?? ""}`}
        style={{ fontFamily: COMIC_FONT, letterSpacing: "0.04em", ["--comic-ink" as string]: colors.INK, ["--comic-line" as string]: colors.LINE, ["--comic-yellow" as string]: colors.YELLOW, ["--comic-on-yellow" as string]: colors.ON_YELLOW, ...style }}
      >
        {props.children}
      </Link>
    );
  }

  const fills: Record<ComicButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.RED, fg: colors.ON_LOUD, border: colors.LINE },
    yellow: { bg: colors.YELLOW, fg: colors.ON_YELLOW, border: colors.LINE },
    secondary: { bg: colors.PAPER_RAISED, fg: colors.INK, border: colors.LINE },
    ghost: { bg: "transparent", fg: colors.INK, border: "transparent" },
    danger: { bg: colors.PAPER_RAISED, fg: colors.BAD, border: colors.BAD },
  };
  const f = fills[variant];
  const raised = variant !== "ghost";
  const s: CSSProperties = {
    fontFamily: COMIC_FONT,
    letterSpacing: "0.04em",
    background: f.bg,
    color: f.fg,
    borderColor: f.border,
    boxShadow: raised ? `3px 3px 0 ${colors.LINE}` : undefined,
    // Light-on-red needs the same hard drop the cover lettering has.
    textShadow: variant === "primary" ? `0.06em 0.06em 0 ${colors.TITLE_STROKE}` : undefined,
    transform: tilt ? `rotate(${tilt}deg)` : undefined,
    ["--comic-ink" as string]: colors.INK, ["--comic-line" as string]: colors.LINE,
    ["--comic-yellow" as string]: colors.YELLOW, ["--comic-on-yellow" as string]: colors.ON_YELLOW,
    ...style,
  };

  const handlePress = (e: PressEvent) => {
    if (sfx !== false) {
      const opts = typeof sfx === "string" ? { text: sfx } : sfx;
      sfxAt(e.target, opts);
    }
    onPress?.(e);
  };

  return (
    <AriaButton
      {...props}
      onPress={handlePress}
      style={s}
      className={`comic-press ${raised ? "comic-lift" : "comic-ghost"} inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md border-[3px] select-none uppercase leading-none disabled:cursor-not-allowed disabled:opacity-40 ${SIZE[size]} ${className ?? ""}`}
    />
  );
}

/** Round close/icon button in the same idiom. */
export function ComicIconButton({ label, sfx, className, style, onPress, ...props }: AriaButtonProps & { label: string; sfx?: string | { text?: string; size?: number; fill?: string } | false; style?: CSSProperties }) {
  const { colors } = useComic();

  const handlePress = (e: PressEvent) => {
    if (sfx !== false) {
      const opts = typeof sfx === "string" ? { text: sfx } : sfx;
      sfxAt(e.target, opts);
    }
    onPress?.(e);
  };

  return (
    <AriaButton
      aria-label={label}
      {...props}
      onPress={handlePress}
      style={{ background: colors.PAPER_RAISED, color: colors.INK, borderColor: colors.LINE, boxShadow: `3px 3px 0 ${colors.LINE}`, ["--comic-ink" as string]: colors.INK, ["--comic-line" as string]: colors.LINE, ...style }}
      className={`comic-press comic-lift inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-[3px] disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ""}`}
    />
  );
}

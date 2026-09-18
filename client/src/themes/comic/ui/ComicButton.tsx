import { Button as AriaButton, type ButtonProps as AriaButtonProps, type PressEvent } from "react-aria-components";
import type { CSSProperties, ReactNode } from "react";
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
}

/** Bangers-lettered, ink-bordered, hard-shadowed button that presses into its shadow. */
export function ComicButton({ variant = "secondary", size = "md", tilt = 0, sfx, className, style, onPress, ...props }: ComicButtonProps) {
  const { colors } = useComic();
  const fills: Record<ComicButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.RED, fg: "#fffaf0", border: colors.INK },
    yellow: { bg: colors.YELLOW, fg: "#0b0b0d", border: colors.INK },
    secondary: { bg: colors.PAPER_RAISED, fg: colors.INK, border: colors.INK },
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
    boxShadow: raised ? `3px 3px 0 ${colors.INK}` : undefined,
    transform: tilt ? `rotate(${tilt}deg)` : undefined,
    ["--comic-ink" as string]: colors.INK,
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
      className={`comic-press inline-flex items-center justify-center whitespace-nowrap rounded-md border-[3px] select-none uppercase leading-none disabled:cursor-not-allowed disabled:opacity-40 ${raised ? "" : "hover:underline"} ${SIZE[size]} ${className ?? ""}`}
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
      style={{ background: colors.PAPER_RAISED, color: colors.INK, borderColor: colors.INK, boxShadow: `3px 3px 0 ${colors.INK}`, ["--comic-ink" as string]: colors.INK, ...style }}
      className={`comic-press inline-flex size-10 items-center justify-center rounded-full border-[3px] disabled:opacity-40 ${className ?? ""}`}
    />
  );
}

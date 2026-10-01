import { Dialog as AriaDialog, Heading, Modal as AriaModal, ModalOverlay } from "react-aria-components";
import type { CSSProperties, ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { useThemeTokens } from "../../context";
import { tokensToCssVars } from "../../tokens";
import { XIcon } from "../../../core/ui/icons";
import { FIXED_HEIGHT } from "../../../core/ui/Dialog";
import { COMIC_FONT } from "../font";
import { halftoneLayerStyle, useScreenHalftone } from "../fx/Halftone";
import { ComicBurstRays } from "./ComicBurst";
import { ComicIconButton } from "./ComicButton";
import { isDarkPaper, PrintedShade, toneColors, type ToneOrColor } from "./tones";
import { useComic } from "./useComic";
import { useModalDepth } from "./modalStack";

const MAX_WIDTH = {
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

/**
 * Hook: the style object that re-applies the theme's CSS vars inside a
 * react-aria portal (which mounts at <body>, outside ThemeProvider's div).
 * Spread it on the portal's outermost element and every core/ui component
 * inside picks up the comic chrome tokens.
 */
export function useThemeVarsInPortal(): CSSProperties {
  const tokens = useThemeTokens();
  const { vars } = useComic();
  return { ...tokensToCssVars(tokens), ...vars };
}

/**
 * Scrim + sunbeams + halftone backdrop shared by every comic overlay. The
 * beams are the same slow-turning ones the tile modal has (ComicBurstRays);
 * they fade in and out with the overlay itself via its CSS keyframes.
 *
 * A modal opened on top of another one (see useModalDepth) skips the beams and
 * halftone and just dims what's behind: the first modal already has its beams.
 */
export function ComicBackdrop({ className }: { className?: string }) {
  const { colors } = useComic();
  const reduceMotion = useReducedMotion();
  const stacked = useModalDepth() > 0;
  const dots = useScreenHalftone();
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <div className="absolute inset-0" style={{ background: colors.SCRIM, opacity: stacked ? 0.55 : 0.7 }} />
      {!stacked && (
        <>
          <div className="absolute inset-0 flex items-center justify-center">
            <ComicBurstRays reduceMotion={!!reduceMotion} />
          </div>
          {dots && <div className="comic-halftone" style={halftoneLayerStyle(dots, { position: "absolute", ["--comic-halftone-ink" as string]: colors.YELLOW, ["--comic-halftone-opacity" as string]: 0.18 } as CSSProperties)} />}
        </>
      )}
    </div>
  );
}

/**
 * The comic modal frame: ink-bordered paper with a hard shadow, a wavy torn
 * top edge, and a caption-box header. Controlled via `isOpen` so react-aria
 * can play exit animations.
 */
export function ComicDialog({
  isOpen,
  onClose,
  children,
  size = "md",
  isDismissable = true,
  className,
  fixedHeight = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof MAX_WIDTH;
  isDismissable?: boolean;
  className?: string;
  /** One height whatever the content (as core's Dialog), so switching a filter inside doesn't make it jump. */
  fixedHeight?: boolean;
}) {
  const portalVars = useThemeVarsInPortal();
  const { colors } = useComic();
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable={isDismissable}
      className="comic-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 text-on-surface"
      style={portalVars}
    >
      <ComicBackdrop />
      <AriaModal className={`comic-panel-pop relative w-full ${MAX_WIDTH[size]} ${className ?? ""}`}>
        <div
          className={`relative max-h-[90vh] overflow-y-auto border-[3px] ${fixedHeight ? FIXED_HEIGHT : ""}`}
          style={{ background: colors.PAPER, borderColor: colors.LINE, boxShadow: `8px 8px 0 ${colors.SHADOW}, 8px 8px 0 3px ${colors.YELLOW}` }}
        >
          <AriaDialog className="outline-none">{children}</AriaDialog>
        </div>
      </AriaModal>
    </ModalOverlay>
  );
}

/**
 * Caption-box header with a Bangers title and a round close button. It stays pinned to the top of the dialog as it
 * scrolls, along with `below` (e.g. a row of filter tabs) if given.
 */
export function ComicDialogHeader({
  title,
  subtitle,
  onClose,
  action,
  tone = "yellow",
  below,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  action?: ReactNode;
  /** A named tone, or a colour of its own (a team's). */
  tone?: ToneOrColor;
  below?: ReactNode;
}) {
  const { colors } = useComic();
  const { loud, tint, onLoud } = toneColors(colors, tone);
  // A loud slab on light paper; on a dark palette's charcoal a slab of bright yellow or blue that size glares, so it's
  // the tone's tint and shading instead, lettered in the palette's own ink (as a ToneBox is).
  const dark = isDarkPaper(colors);
  const fill = dark ? tint : loud;
  const fg = dark ? colors.INK : onLoud;
  return (
    <div className="sticky top-0 z-10">
      <div className="relative flex items-start justify-between gap-4 border-b-[3px] px-5 py-3" style={{ background: fill, borderColor: colors.LINE, color: fg }}>
        {dark && <PrintedShade ink={loud} />}
        <div className="relative min-w-0">
          <Heading slot="title" className="truncate text-3xl uppercase leading-none tracking-wide" style={{ fontFamily: COMIC_FONT, color: fg }}>
            {title}
          </Heading>
          {subtitle && (
            <p className="mt-1 text-sm" style={{ color: fg, opacity: 0.85 }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          {action}
          <ComicIconButton label="Close" onPress={onClose}>
            <XIcon />
          </ComicIconButton>
        </div>
      </div>
      {below}
    </div>
  );
}

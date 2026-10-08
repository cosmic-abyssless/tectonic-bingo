// A real tooltip — readable size, appears quickly, gone the instant the
// pointer leaves — for anywhere a native `title` attribute isn't good
// enough (small, slow, and inconsistent across browsers). Wrap a single
// native-element child (a <span>, not one of our own components) — <Focusable>
// below is what makes a plain element hoverable/focusable-as-a-trigger; its
// type requires exactly that (a DOM element, not a custom component).
//
//   <Tooltip content="The full text">
//     <span className="truncate">shortened…</span>
//   </Tooltip>
import { createContext, useContext, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { Focusable, Tooltip as AriaTooltip, TooltipTrigger, type Placement } from "react-aria-components";

// react-aria's default is 1.5s before showing (tuned for "don't spam a
// tooltip on every incidental hover") — noticeably slow for something meant
// to read truncated text; closeDelay 0 so it isn't sticky on the way out.
const DELAY_MS = 200;

type FocusableChild = ComponentProps<typeof Focusable>["children"];

const TooltipsOff = createContext(false);

/**
 * Inside an AG grid, tooltips are AG's own (a column's `tooltip`, see gridTooltips.ts): ours would stack on top of
 * them, and a trigger per row is what made the grids slow to mount. Shared pieces drawn in a cell (a player's name, an
 * item link) render without theirs under this, so the column's tooltip has to carry what they said.
 */
export function NoTooltips({ children }: { children: ReactNode }) {
  return <TooltipsOff.Provider value={true}>{children}</TooltipsOff.Provider>;
}

export function Tooltip({
  children,
  content,
  placement = "top",
  excludeFromTabOrder,
  delay = DELAY_MS,
}: {
  children: FocusableChild;
  content: ReactNode;
  placement?: Placement;
  /** For a trigger that repeats something a keyboard already reaches (an overlay on a Tile): hover only. */
  excludeFromTabOrder?: boolean;
  /** How long a hover waits before showing it, in ms: 0 for something that's only a picture without it (an avatar). */
  delay?: number;
}) {
  const off = useContext(TooltipsOff);
  if (!content || off) return children;
  return (
    <TooltipTrigger delay={delay} closeDelay={0}>
      {/* TooltipTrigger only provides context with the hover/focus wiring — react-aria-components' own
          <Button>/<Link> know to read it, but a plain element (our <span>) doesn't unless wrapped in
          <Focusable>, which applies it via cloneElement regardless of the child's type. */}
      <Focusable excludeFromTabOrder={excludeFromTabOrder}>{children}</Focusable>
      <AriaTooltip
        placement={placement}
        offset={6}
        className="overlay-panel max-w-xs whitespace-pre-line rounded-md border border-outline bg-surface-raised px-2.5 py-1.5 text-xs text-on-surface shadow-pop outline-none"
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}

/** Tooltip whose content is just text — the common case (a truncated cell, an abbreviated label, ...). */
export function TextTooltip({ children, text, placement, delay }: { children: FocusableChild; text: string; placement?: Placement; delay?: number }) {
  return (
    <Tooltip content={text} placement={placement} delay={delay}>
      {children}
    </Tooltip>
  );
}

/**
 * Plain content with a tooltip: a number, a time, a chip, an icon. <Focusable> makes the span keyboard-reachable, and
 * wants a role it can describe with the tooltip, so the span reads as an image of `label` (what it shows, in words).
 * Inside a button or link, put the tooltip on that instead, or make it hoverOnly.
 */
export function TooltipSpan({
  text,
  label,
  className,
  style,
  placement,
  hoverOnly,
  children,
}: {
  text: string;
  label: string;
  className?: string;
  style?: CSSProperties;
  placement?: Placement;
  /** Out of the tab order: for a mark inside a button or menu item, whose screen-reader text is the label. */
  hoverOnly?: boolean;
  children?: ReactNode;
}) {
  return (
    <Tooltip content={text} placement={placement} excludeFromTabOrder={hoverOnly}>
      <span role="img" aria-label={label} className={className} style={style}>
        {children}
      </span>
    </Tooltip>
  );
}

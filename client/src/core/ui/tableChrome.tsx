// Shared chrome for a scrollable data table pinned under the site header —
// used by the draft pool table and the signup roster so both stick and
// stripe the same way (issue #112: make table behaviour consistent between
// the scouting page and the admin panel).
import { useEffect, useState, type ReactNode } from "react";
import { TextTooltip } from "./Tooltip";

// The column headings stay at the top of the table's own scroll area — draws
// its own bottom divider: a sticky cell paints over the table's collapsed
// borders.
export const STICKY_TOP = "sticky top-0 z-10 bg-surface shadow-[inset_0_-1px_0_0_var(--color-outline)]";
// A trailing column (e.g. a Draft button) pinned to the right edge while the
// table scrolls sideways, with a soft shadow over the columns scrolling
// under it.
export const STICKY_HEADER = "sticky right-0 top-0 z-20 bg-surface shadow-[inset_0_-1px_0_0_var(--color-outline),-8px_0_8px_-8px_var(--color-shade)]";
export const STICKY_CELL = "sticky right-0 bg-surface shadow-[inset_0_1px_0_0_var(--color-outline),-8px_0_8px_-8px_var(--color-shade)]";

// Alternating row background. Applied per row-group (a <tbody>) rather than
// per <tr> so a duo pair's two rows share one stripe instead of alternating
// against each other.
export const STRIPE_ODD = "odd:bg-surface-muted/40";

// A custom signup question's prompt (the header) and its answers (the cells)
// are free text a mod writes/players fill in — either can run far longer
// than any other column. Same width for both, so the column doesn't end up
// wider than its own header or its own longest answer alone would make it.
export const QUESTION_COLUMN_MAX_WIDTH = "12rem";

/**
 * How far down the whole document `element`'s top edge sits — not
 * `getBoundingClientRect().top` alone, which is relative to the current
 * scroll position and shrinks as the page scrolls; adding `scrollY` back
 * recovers a stable, scroll-independent value. For sizing a table's own
 * scroll box to exactly what's left of the viewport: everything above the
 * element (the site header, whatever chrome the page itself has, this
 * table's own toolbar) is already baked into one number, no need to
 * separately measure or guess at each piece.
 *
 * Re-measures on any resize of the page, since anything above the element
 * changing height (a notice appearing, filter chips wrapping to a second
 * line, the window itself resizing) moves it.
 */
export function useDocumentTop(element: Element | null): number {
  const [top, setTop] = useState(0);
  useEffect(() => {
    if (!element) return;
    const measure = () => setTop(element.getBoundingClientRect().top + window.scrollY);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [element]);
  return top;
}

// Tooltip's TooltipTrigger + Focusable + useOverlayPosition setup is real
// work per instance — fine for a handful of cells, not for hundreds at once.
// A table with dozens of rows, each with several Truncate'd cells (RSN,
// Discord, a Partner, a handful of question answers), mounts hundreds of
// these at once whenever a filter reveals rows that were unmounted while
// hidden (e.g. clearing a search) — measured as a 100ms+ single React commit
// on this table with ~60 rows. Most of those cells' text never gets
// anywhere near the column's max-width in the first place, so most of them
// don't need a tooltip at all: they just need the same `overflow-hidden`
// safety net any of them would need if a column turned out narrower than
// expected. willTruncate below decides which is which with an actual pixel
// measurement (a canvas is much cheaper than mounting the tooltip stack),
// not a guess, with a safety margin for font/rendering differences across
// browsers — so it only skips the tooltip when the text is comfortably
// short, never when it's genuinely close to the edge.
let measureCtx: CanvasRenderingContext2D | null | undefined;
const MEASURE_FONT = "500 14px system-ui, sans-serif"; // text-sm, and the heavier of the weights Truncate is actually used at (RSN's font-medium) — a safe overestimate for the rest
const SAFETY_MARGIN = 0.85; // only skip the tooltip when comfortably under the limit, not right at the edge

function willTruncate(text: string, maxWidth: string): boolean {
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return true; // can't measure (e.g. a test environment) — the safe default is to keep the tooltip
  measureCtx.font = MEASURE_FONT;
  const maxWidthPx = parseFloat(maxWidth) * 16; // every caller passes a `rem` value
  return measureCtx.measureText(text).width > maxWidthPx * SAFETY_MARGIN;
}

/**
 * A wide cell's content (an RSN, a free-text answer, ...), clipped with an
 * ellipsis and a real tooltip on hover/focus — not a native `title`, which
 * renders small and takes ~1.5s to appear — rather than stretching the
 * column to fit its longest value. `title` is plain text for the tooltip;
 * children can be the same text or something built on top of it
 * (Highlight's <mark>s). Skips the tooltip machinery entirely (see
 * willTruncate above) when `title` is short enough that it's not going to
 * clip anyway — still `truncate`s via CSS as a fallback, just without
 * paying for a tooltip nothing will ever show.
 */
export function Truncate({ children, title, maxWidth = "16rem", className = "" }: { children: ReactNode; title: string; maxWidth?: string; className?: string }) {
  if (!willTruncate(title, maxWidth)) {
    return (
      <span className={`block truncate ${className}`} style={{ maxWidth }}>
        {children}
      </span>
    );
  }
  return (
    <TextTooltip text={title}>
      {/* tabIndex so a keyboard user can focus-trigger it too, not just hover. role="button": <Focusable> (inside
          Tooltip) requires a focusable, non-native element to carry an interactive ARIA role — without one it's a dev
          warning on every mount ("<Focusable> child must have an interactive ARIA role"), spamming the console once
          per truncated cell. */}
      <span tabIndex={0} role="button" className={`block truncate outline-none ${className}`} style={{ maxWidth }}>
        {children}
      </span>
    </TextTooltip>
  );
}

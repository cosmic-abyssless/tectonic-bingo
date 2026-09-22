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

/**
 * A wide cell's content (an RSN, a free-text answer, ...), clipped with an
 * ellipsis and a real tooltip on hover/focus — not a native `title`, which
 * renders small and takes ~1.5s to appear — rather than stretching the
 * column to fit its longest value. `title` is plain text for the tooltip;
 * children can be the same text or something built on top of it
 * (Highlight's <mark>s).
 */
export function Truncate({ children, title, maxWidth = "16rem", className = "" }: { children: ReactNode; title: string; maxWidth?: string; className?: string }) {
  return (
    <TextTooltip text={title}>
      {/* tabIndex so a keyboard user can focus-trigger it too, not just hover. */}
      <span tabIndex={0} className={`block truncate outline-none ${className}`} style={{ maxWidth }}>
        {children}
      </span>
    </TextTooltip>
  );
}

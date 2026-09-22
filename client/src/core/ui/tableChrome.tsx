// Shared chrome for a scrollable data table pinned under the site header —
// used by the draft pool table and the signup roster so both stick and
// stripe the same way (issue #112: make table behaviour consistent between
// the scouting page and the admin panel).
import { useEffect, useState, type ReactNode } from "react";
import { useElementHeight } from "./useElementHeight";
import { TextTooltip } from "./Tooltip";

// The column headings stay at the top of the table's own scroll area (or, for
// a table with no independent scroll container, at the top of the page's
// scroll under the fixed site header — see useStickyTop). Draws its own
// bottom divider: a sticky cell paints over the table's collapsed borders.
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

/** The fixed site header's current height, so a table with its own vertical scroll (or a sticky <thead>) can sit right below it. */
export function useStickyTop(): number {
  const [header, setHeader] = useState<Element | null>(null);
  useEffect(() => setHeader(document.querySelector("header")), []);
  return useElementHeight(header);
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

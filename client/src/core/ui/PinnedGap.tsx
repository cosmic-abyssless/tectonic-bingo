import { useOptionalSlot } from "../../themes/context";

/**
 * A strip pinned just under the page header, showing the page's own backdrop (the theme's PageBackdrop, on the page
 * colour): what scrolls up passes under it rather than showing in it, so a block pinned below it keeps the gap it had
 * from the header at rest. Size it with className (h-3). clip-path keeps a backdrop's fixed, full-window layers to the
 * strip, where they line up with the page's own.
 */
export function PinnedGap({ top, className }: { top: number; className?: string }) {
  const Backdrop = useOptionalSlot("PageBackdrop");
  return (
    <div aria-hidden className={`sticky z-30 bg-background [clip-path:inset(0)] ${className ?? ""}`} style={{ top }}>
      {Backdrop && <Backdrop />}
    </div>
  );
}

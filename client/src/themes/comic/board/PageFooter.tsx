import { COMIC_FONT } from "../font";
import { bw } from "./ClosedBook";
import type { ComicColors } from "./colors";

/**
 * The strip along the foot of a book page: a rule, then "PAGE n" on the
 * outer edge and what the page is (contents, part k of m, submissions) at
 * the spine — like a running foot in a printed comic. Opaque paper so
 * scrolling content passes cleanly under it, and clear of the page-edge
 * ticks on the outer side. Purely decorative: it never takes the pointer.
 */
export function PageFooter({ colors, side, no, role }: { colors: ComicColors; side: "left" | "right"; no: number; role: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between uppercase"
      style={{
        // A right-hand page's outer edge is its right, a left-hand page's its left.
        flexDirection: side === "right" ? "row-reverse" : "row",
        height: bw(0.06),
        paddingInline: bw(0.06),
        borderTop: `${bw(0.006)} solid ${colors.RULE}`,
        backgroundColor: colors.PAPER,
        color: colors.INK_SUBTLE,
        fontFamily: COMIC_FONT,
        fontSize: bw(0.026),
        letterSpacing: "0.04em",
      }}
    >
      <span>Page {no}</span>
      <span>{role}</span>
    </div>
  );
}

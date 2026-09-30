import type { RewindPopupPointer } from "../../rewindPopupPointer";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The free area the card must stay within: under the header, over the timeline, off the screen's edges. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Null when there's no Tile to point at. */
  pointer: RewindPopupPointer | null;
}

// How far in from a corner the pointer may come out, clear of the card's rounded corners.
const CORNER_PX = 28;

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));

/**
 * Where a Rewind popup's card goes: beside its Tile, `gap` away (room for a theme's tail), trying above the Tile, then
 * below it, then to its right, then its left, the first side where the whole card fits within `bounds` (and, beside it, faces it); slid along
 * that side to stay within them. When no side fits, above or below, whichever has more room, clamped within `bounds`
 * even if it covers the Tile. Without a Tile, centred at the top.
 */
export function placePopup(tile: Box | null, card: { width: number; height: number }, bounds: Bounds, gap: number): Placement {
  if (!tile)
    return {
      left: clamp((bounds.left + bounds.right - card.width) / 2, bounds.left, bounds.right - card.width),
      top: bounds.top,
      pointer: null,
    };

  const cx = tile.left + tile.width / 2;
  const cy = tile.top + tile.height / 2;
  const x = clamp(cx - card.width / 2, bounds.left, bounds.right - card.width);
  const y = clamp(cy - card.height / 2, bounds.top, bounds.bottom - card.height);

  // Each side: where the card goes, and the card's edge the pointer comes out of.
  const sides: {
    left: number;
    top: number;
    edge: RewindPopupPointer["edge"];
  }[] = [
    { left: x, top: tile.top - gap - card.height, edge: "bottom" },
    { left: x, top: tile.top + tile.height + gap, edge: "top" },
    { left: tile.left + tile.width + gap, top: y, edge: "left" },
    { left: tile.left - gap - card.width, top: y, edge: "right" },
  ];
  // Beside the Tile only counts when the card's side really faces it, not a Tile scrolled away above or below.
  const fits = (s: (typeof sides)[number]) =>
    s.left >= bounds.left &&
    s.top >= bounds.top &&
    s.left + card.width <= bounds.right &&
    s.top + card.height <= bounds.bottom &&
    (s.edge === "top" || s.edge === "bottom" || (cy >= s.top + CORNER_PX && cy <= s.top + card.height - CORNER_PX));
  const roomAbove = tile.top - bounds.top;
  const roomBelow = bounds.bottom - (tile.top + tile.height);
  const side =
    sides.find(fits) ??
    (roomAbove >= roomBelow
      ? {
          ...sides[0],
          top: clamp(sides[0].top, bounds.top, bounds.bottom - card.height),
        }
      : {
          ...sides[1],
          top: clamp(sides[1].top, bounds.top, bounds.bottom - card.height),
        });

  const alongX = side.edge === "top" || side.edge === "bottom";
  const length = alongX ? card.width : card.height;
  const offset = clamp(alongX ? cx - side.left : cy - side.top, Math.min(CORNER_PX, length / 2), Math.max(length - CORNER_PX, length / 2));
  return {
    left: side.left,
    top: side.top,
    pointer: { edge: side.edge, offset },
  };
}

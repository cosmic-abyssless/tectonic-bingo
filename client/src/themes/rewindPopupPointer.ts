import type { CSSProperties } from "react";

/** Which of a Rewind popup's edges faces its Tile, and how far along that edge (px from its left or top) the Tile is. */
export interface RewindPopupPointer {
  edge: "top" | "bottom" | "left" | "right";
  offset: number;
}

/** The space the page leaves between a Rewind popup and its Tile, for a theme's tail. */
export const REWIND_POPUP_GAP = 20;

const TURN: Record<RewindPopupPointer["edge"], number> = {
  bottom: 0,
  left: 90,
  top: 180,
  right: -90,
};

/**
 * Style for a zero-size box on the card's edge, where the pointer comes out, turned so that down (+y) inside it points
 * out of the card at the Tile: draw a tail pointing down from its origin and it points the right way on any edge. For
 * an element positioned inside the card, whose `border` px border the offset (measured from the card's outer edge)
 * skips.
 */
export function pointerAnchorStyle(pointer: RewindPopupPointer, border = 0): CSSProperties {
  const along = `${pointer.offset - border}px`;
  const at: CSSProperties =
    pointer.edge === "bottom" ? { left: along, top: "100%" } : pointer.edge === "top" ? { left: along, top: 0 } : pointer.edge === "left" ? { left: 0, top: along } : { left: "100%", top: along };
  return {
    position: "absolute",
    width: 0,
    height: 0,
    ...at,
    transform: `rotate(${TURN[pointer.edge]}deg)`,
  };
}

import { useSyncExternalStore } from "react";

/*
 * Tiny bridge between TileCell and TileModal for the "book flies off the
 * board and opens into the modal" animation.
 *
 * TileCell registers the DOM element of its book's frame (the 2D box the
 * book sits in) so TileModal can measure where on screen the flight should
 * start from (on open) and land on (on close), and what pose the book is
 * in at that moment. TileModal in turn marks which tile's book is currently
 * "away" — TileCell hides its own copy while the modal's copy is in flight
 * or open, so there's never two of the same book on screen at once.
 *
 * A module-level store (not React context) because both sides are leaf
 * slots rendered in unrelated parts of the tree — the modal is portaled out
 * to <body> by react-aria — and the registry has to survive TileCell's
 * React.memo without forcing re-renders on every board update.
 */

const frames = new Map<string, HTMLElement>();
let awayTileId: string | null = null;
const listeners = new Set<() => void>();

/** `frame` is the untransformed 2D box the book sits in; the book itself is its `[data-book]` child. */
export function registerBook(tileId: string, frame: HTMLElement | null) {
  if (frame) frames.set(tileId, frame);
  else frames.delete(tileId);
}

export interface BookPose {
  /** Viewport center of the book, hover lift included. */
  cx: number;
  cy: number;
  /** The book's UNprojected height (frame height × any hover scale) — what a copy has to scale to. */
  height: number;
  /** The frame's width, which the tile's perspective is a fixed multiple of. */
  frameWidth: number;
  /** The hover lift (px, negative = up) — the frame's vanishing point stays put while the book rises by this. */
  lift: number;
  /** Current hinge angles (deg) of the cover and front page — mid-spring if the tile's hovered/pressed. */
  coverAngle: number;
  pageAngle: number;
}

function matrixOf(el: Element | null): DOMMatrix | null {
  if (!el) return null;
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === "none") return null;
  return new DOMMatrix(transform);
}

// The cover and page only ever rotate about Y, so their computed matrix is
// a plain rotateY: m11 = cos θ, m13 = -sin θ.
function rotateYOf(el: Element | null, fallback: number): number {
  const m = matrixOf(el);
  return m ? (Math.atan2(-m.m13, m.m11) * 180) / Math.PI : fallback;
}

/**
 * Where the tile's book is right now, or null if that tile isn't on screen.
 * Measured from the frame (2D, so its rect is the book's true box) plus the
 * book's own transform matrix — rather than the book's bounding rect, which
 * is the box of its perspective-projected tilt and would put a copy at the
 * wrong size.
 */
export function getBookPose(tileId: string, fallback: { coverAngle: number; pageAngle: number }): BookPose | null {
  const frame = frames.get(tileId);
  if (!frame || !frame.isConnected) return null;
  const rect = frame.getBoundingClientRect();
  if (rect.width === 0) return null;
  const book = frame.querySelector("[data-book]");
  // The book's transform is translateY · scale · rotateY (motion's order),
  // so m22 is the scale untouched by the rotation, and m42 the lift in px.
  const m = matrixOf(book);
  const scale = m ? m.m22 : 1;
  const lift = m ? m.m42 : 0;
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2 + lift,
    height: rect.height * scale,
    frameWidth: rect.width,
    lift,
    coverAngle: rotateYOf(frame.querySelector("[data-book-cover]"), fallback.coverAngle),
    pageAngle: rotateYOf(frame.querySelector("[data-book-page]"), fallback.pageAngle),
  };
}

export function setBookAway(tileId: string | null) {
  if (awayTileId === tileId) return;
  awayTileId = tileId;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True while this tile's book is off flying in the modal — the cell hides its own copy. */
export function useIsBookAway(tileId: string): boolean {
  return useSyncExternalStore(subscribe, () => awayTileId === tileId);
}

import { useSyncExternalStore } from "react";

/**
 * Where on screen the comic issue was when it was clicked. TileCell writes
 * it right before calling onOpen; the book modal reads it to start its
 * fly-in from the cover's exact position (a FLIP animation). Module state
 * rather than context because the two sit in unrelated slot trees.
 */
export interface BookOrigin {
  tileId: string;
  /** Where the cover is drawn (not its axis-aligned bounding box). */
  rect: { left: number; top: number; width: number; height: number };
  /** The cover's rotation at take-off, degrees. */
  rotate: number;
  /** Cover fill so the flying cover matches the tile. */
  coverColor?: string;
}

let origin: BookOrigin | null = null;

export function setBookOrigin(o: BookOrigin | null) {
  origin = o;
}

export function takeBookOrigin(tileId: string): BookOrigin | null {
  if (origin && origin.tileId === tileId) return origin;
  return null;
}

/** Live 2D rotation of an element in degrees, read from its computed transform. */
export function currentRotation(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return 0;
  const [a, b] = m[1].split(",").map(Number);
  return (Math.atan2(b, a) * 180) / Math.PI;
}

/**
 * Resting rect of the cover for `tileId`, for the fly-back on close. This
 * measures the rack slot (`data-comic-slot`), not the cover itself: the
 * cover at rest is rotated by `coverTilt`, and the bounding box of a rotated
 * element is bigger than the element. Flying to the slot rect with the same
 * tilt lands pixel-exact on the resting cover.
 */
export function currentCoverRect(tileId: string): DOMRect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(`[data-comic-slot="${CSS.escape(tileId)}"]`);
  return el ? el.getBoundingClientRect() : null;
}

/**
 * Deterministic resting tilt (degrees) per tile so the rack looks
 * hand-stocked. Shared by the tile and the flying cover so the issue lands
 * back at exactly the angle it rests at.
 */
export function coverTilt(tileId: string): number {
  let h = 0;
  for (let i = 0; i < tileId.length; i++) h = (h * 31 + tileId.charCodeAt(i)) >>> 0;
  return ((h % 5) - 2) * 0.9;
}

/**
 * Which issue is currently "off the rack": lifted out of its slot and held
 * in the reader's hands (the modal). While set, the tile renders an empty
 * slot so the same cover isn't on screen twice. The modal owns this: it
 * sets it the moment the cover starts flying and clears it when the book
 * has landed back on the rack.
 */
let awayTileId: string | null = null;
const listeners = new Set<() => void>();

export function setCoverAway(tileId: string | null) {
  if (awayTileId === tileId) return;
  awayTileId = tileId;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useIsCoverAway(tileId: string): boolean {
  return useSyncExternalStore(subscribe, () => awayTileId === tileId, () => false);
}

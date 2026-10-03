// The comic Wrapped's desk: where the book's pages lie. On a wide screen the pages are read a spread at a time, so the
// pages pair up into spreads (a cover lies alone); on a phone each page lies alone. Each group lies a little apart from
// the last, at its own height and its own slight angle, like issues dropped on a desk rather than lined up in a row. Pure
// and deterministic, so the same book always lies the same way.

import { WRAPPED_PAGE_WIDTH, type Place, type StageMode } from "./camera";
import type { PageKind } from "./guide";

/** The room between one group and the next (px, desk coordinates): on a wide screen, enough for a side image between. */
const GAP: Record<StageMode, number> = { wide: 560, phone: 160 };
/** How far a group may sit above or below the row (px), and how far it may be turned (degrees). */
const DRIFT: Record<StageMode, number> = { wide: 150, phone: 70 };
const TILT: Record<StageMode, number> = { wide: 3.2, phone: 2.2 };

/**
 * Which pages lie together, as runs of page indexes. Wide: the covers (and the credits) each alone, the pages between them in pairs (a
 * spread, left then right). Phone: every page alone.
 */
export function deskGroups(kinds: readonly PageKind[], mode: StageMode): number[][] {
  if (mode === "phone") return kinds.map((_, i) => [i]);
  const groups: number[][] = [];
  let run: number[] = [];
  const flush = () => {
    for (let i = 0; i < run.length; i += 2) groups.push(run.slice(i, i + 2));
    run = [];
  };
  kinds.forEach((kind, i) => {
    if (kind === "cover" || kind === "credits" || kind === "back") {
      flush();
      groups.push([i]);
    } else run.push(i);
  });
  flush();
  return groups;
}

/** A spread on the desk: where it lies, and its size (its pages side by side, as tall as the tallest). */
export interface DeskGroup {
  pages: number[];
  place: Place;
  w: number;
  h: number;
}

/** A repeatable scatter in -1 to 1 for the nth group (a hash, not a random draw, so a relayout doesn't reshuffle it). */
function scatter(n: number, salt: number): number {
  const v = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/**
 * Lays the groups out along the desk, left to right, given each page's height. Each group's pages are side by side at
 * x = 0, WRAPPED_PAGE_WIDTH in the group's own coordinates, and the group is as tall as its tallest page.
 */
export function deskLayout(groups: readonly number[][], heights: readonly number[], mode: StageMode): DeskGroup[] {
  let x = 0;
  return groups.map((pages, n) => {
    const w = pages.length * WRAPPED_PAGE_WIDTH;
    const h = Math.max(...pages.map((p) => heights[p] ?? 0));
    // The first lies straight, so the book opens square on; after it, each one drifts, alternating up and down.
    const drift = n === 0 ? 0 : (n % 2 ? 1 : -1) * (0.35 + 0.65 * Math.abs(scatter(n, 1))) * DRIFT[mode];
    const angle = n === 0 ? 0 : scatter(n, 2) * TILT[mode];
    const group = { pages, w, h, place: { x, y: drift, angle } };
    x += w + GAP[mode];
    return group;
  });
}

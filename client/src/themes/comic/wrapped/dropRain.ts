// The Bingo's drops raining down into a pile (the comic Wrapped's "It rained loot" page): where each item's icon lands,
// and when. Pure and seeded, so the same Bingo always piles up the same way, and the shapes are tested without a browser.

/** One icon in the pile: its item, where it comes to rest (its centre, px in the pane), its tilt there, and when it falls. */
export interface RainPiece {
  itemName: string;
  x: number;
  y: number;
  /** Degrees. */
  angle: number;
  /** How far above its resting place it starts (px). */
  fall: number;
  /** When it starts falling (ms after the rain starts). */
  delay: number;
}

export interface RainPile {
  /** The size an icon is drawn at (px). */
  size: number;
  pieces: RainPiece[];
  /** When the last icon has landed (ms). */
  duration: number;
}

/** How much of the pane the pile fills, at most. */
const FILL = 0.66;
/** How high the heap may rise in its middle, as a share of the pane (its sides stay lower, as a heap's do). */
const PEAK = 0.84;
/** An icon's step in the pile, as a share of its size: they overlap a little, as a heap does. */
const STEP = 0.78;
/** The smallest and biggest step (px): small enough for a big Bingo to fit, big enough to tell what each item is. */
const MIN_STEP = 18;
const MAX_STEP = 34;
/** How long the rain lasts (ms): when the last icon sets off, and how long one takes to fall. */
export const RAIN_SPREAD_MS = 1900;
export const FALL_MS = 520;
export const BOUNCE_MS = 160;
/** The least time between two icons landing in the same column (ms). */
const COLUMN_GAP_MS = 45;

/** A seeded random number in [0, 1) (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every drop (one icon each, whatever its quantity) shuffled and piled into a pane of `w` × `h`: the icons are sized so
 * the pile fills about the lower part of it, and a Bingo with more drops than fit at the smallest size rains a share of
 * each item's, in proportion. Each icon falls into the lower of two columns picked at random, more often near the middle,
 * so the pile heaps up into a mound with a ragged top, and the ones lower in a column fall first.
 */
export function rainPile(items: readonly { itemName: string; drops: number }[], w: number, h: number, seed = 1): RainPile {
  const rand = random(seed);
  const all: string[] = items.flatMap((i) => Array.from({ length: i.drops }, () => i.itemName));
  if (all.length === 0 || w <= 0 || h <= 0) return { size: 0, pieces: [], duration: 0 };
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }

  const step = Math.max(MIN_STEP, Math.min(MAX_STEP, Math.sqrt((w * h * FILL) / all.length)));
  const cols = Math.max(1, Math.floor(w / step));
  const rows = Math.max(1, Math.floor((h * FILL) / step));
  // How many icons each column holds under the heap's slope: highest in the middle.
  const room = Array.from({ length: cols }, (_, c) => Math.max(1, Math.floor(((h * PEAK) / step) * (1 - 0.55 * Math.abs((c + 0.5) / cols - 0.5) * 2))));
  const shown = all.slice(0, Math.min(cols * rows, room.reduce((a, b) => a + b, 0)));
  const margin = (w - cols * step) / 2;
  const heights = new Array<number>(cols).fill(0);
  // When each column's top icon set off: the next one onto it sets off after, so it never lands before what it rests on.
  const lastIn = new Array<number>(cols).fill(-Infinity);

  // A column, more likely the nearer the middle (the mean of two draws).
  const pick = () => Math.min(cols - 1, Math.floor(((rand() + rand()) / 2) * cols));
  const pieces = shown.map((itemName, i) => {
    const a = pick();
    const b = pick();
    let col = heights[a]! <= heights[b]! ? a : b;
    // Full to its slope there: the lowest column with room takes it instead.
    if (heights[col]! >= room[col]!) col = heights.reduce((best, n, c) => (n < room[c]! && (heights[best]! >= room[best]! || n / room[c]! < heights[best]! / room[best]!) ? c : best), 0);
    const level = heights[col]!++;
    const x = margin + (col + 0.5) * step + (rand() - 0.5) * step * 0.3;
    const y = h - (level + 0.5) * step + (rand() - 0.5) * step * 0.2;
    const delay = Math.max((i / shown.length) * RAIN_SPREAD_MS + rand() * 90, lastIn[col]! + COLUMN_GAP_MS);
    lastIn[col] = delay;
    return {
      itemName,
      x,
      y,
      angle: (rand() - 0.5) * 50,
      fall: y + step + rand() * h * 0.35,
      delay,
    };
  });
  const last = Math.max(...pieces.map((p) => p.delay));
  return { size: step / STEP, pieces, duration: last + FALL_MS + BOUNCE_MS };
}

/** Where a piece is `t` ms into the rain: falling (gravity: slow, then fast), a little hop as it lands, then at rest. Null before it starts. */
export function pieceAt(p: RainPiece, t: number): { y: number; angle: number } | null {
  const since = t - p.delay;
  if (since < 0) return null;
  if (since < FALL_MS) {
    const k = since / FALL_MS;
    return { y: p.y - p.fall * (1 - k * k), angle: p.angle * k - 25 * (1 - k) };
  }
  const hop = since - FALL_MS;
  if (hop < BOUNCE_MS) return { y: p.y - 5 * Math.sin((Math.PI * hop) / BOUNCE_MS), angle: p.angle };
  return { y: p.y, angle: p.angle };
}

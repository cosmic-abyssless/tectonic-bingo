// Wrapped art's sticker look (#262): a cut-out (a transparent PNG) stuck on a piece of textured paper torn around it.
// Rendered twice with a different tear and tilt ("boil" frames): swapped slowly on the page, the same picture looks
// hand-made and slightly alive. The frames stay transparent around the paper; the page adds the shadow with CSS
// (filter: drop-shadow), which follows the torn edge, since baked-in soft shadows don't survive formats like GIF.
// Done here, once per upload, so pages only load finished images.
import sharp from "sharp";
import { WRAPPED_ART_KEYING_DEFAULTS, type WrappedArtKeying } from "@bingo/shared";

export interface StickerOptions {
  /** Longest side of the output, px. */
  size?: number;
  /** One per frame: the tear's shape (seed) and the sticker's tilt (degrees, clockwise). */
  frames?: { seed: number; tilt: number }[];
}

/** How wide the paper border is, as a share of the cut-out's longest side. */
const STROKE = 0.018;
/** How far the torn edge wanders (big wobble, small jaggies), as a share of the stroke. */
const WOBBLE = 0.27;
const JAGGIES = 0.21;
/** Paper colour: a warm white, so it reads as paper next to the page's own white. */
const PAPER = { r: 244, g: 240, b: 228 };
/** Paper texture: per-pixel grain, and a faint mottle over larger patches (± this much lightness). */
const GRAIN = 16;
const MOTTLE = 11;
/** The torn edge's fibres: a thin, slightly darker rim just inside the tear. */
const FIBRE = { r: 214, g: 207, b: 190 };

/** A small seeded PRNG (mulberry32): the same seed always tears the same way. */
function rng(seed: number): () => number {
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
 * 2D value noise in −1..1 over a grid of `cell` px. Smooth (smoothstep) for the tear's big wobble; `angular` (plain
 * linear) for its small jaggies, which gives the straight little runs and sharp corners of torn paper.
 */
function valueNoise(width: number, height: number, cell: number, random: () => number, angular = false): Float32Array {
  const gw = Math.ceil(width / cell) + 2;
  const gh = Math.ceil(height / cell) + 2;
  const grid = new Float32Array(gw * gh).map(() => random() * 2 - 1);
  const out = new Float32Array(width * height);
  const smooth = angular ? (t: number) => t : (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < height; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const ty = smooth(gy - y0);
    for (let x = 0; x < width; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const tx = smooth(gx - x0);
      const a = grid[y0 * gw + x0]!;
      const b = grid[y0 * gw + x0 + 1]!;
      const c = grid[(y0 + 1) * gw + x0]!;
      const d = grid[(y0 + 1) * gw + x0 + 1]!;
      out[y * width + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

/** Each pixel's distance (px) to the nearest opaque pixel of `mask`: a two-pass chamfer transform. */
function distanceTo(mask: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(width * height).map((_, i) => (mask[i] ? 0 : INF));
  const D1 = 1;
  const D2 = Math.SQRT2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v = d[i]!;
      if (x > 0) v = Math.min(v, d[i - 1]! + D1);
      if (y > 0) {
        v = Math.min(v, d[i - width]! + D1);
        if (x > 0) v = Math.min(v, d[i - width - 1]! + D2);
        if (x < width - 1) v = Math.min(v, d[i - width + 1]! + D2);
      }
      d[i] = v;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let v = d[i]!;
      if (x < width - 1) v = Math.min(v, d[i + 1]! + D1);
      if (y < height - 1) {
        v = Math.min(v, d[i + width]! + D1);
        if (x < width - 1) v = Math.min(v, d[i + width + 1]! + D2);
        if (x > 0) v = Math.min(v, d[i + width - 1]! + D2);
      }
      d[i] = v;
    }
  }
  return d;
}

/**
 * Keying out a solid background (a RuneLite Blindfold screenshot), the way Photopea's Color Range would. Distances are
 * straight RGB distances (0–441). Within `tolerance` of the key colour a pixel is background, gone wherever it is (the
 * gaps between an arm and the body too). Up to `tolerance + softness` it's an anti-aliased fringe: partly see-through,
 * with the key colour taken back out of it. Further than that it's the art, left as it is.
 */
export type KeyingOptions = WrappedArtKeying;

/** A first guess, from synthetic screenshots: to be settled on real ones with the maintainer (Admins can re-cut). */
export const DEFAULT_KEYING: KeyingOptions = WRAPPED_ART_KEYING_DEFAULTS;

/** The outer edge the key colour is read from: this share of the shorter side, at least 2 px. */
const EDGE_RING = 0.01;
/** How much of the edge must be the key colour (within EDGE_MATCH), or it isn't a solid-colour screenshot. */
const EDGE_SHARE = 0.9;
const EDGE_MATCH = 40;

/** Why an upload can't become a cut-out, worded for the Admin who uploaded it. */
export class CutOutError extends Error {}

export const NOT_SOLID_MESSAGE = "Upload a transparent PNG, or a screenshot on one solid colour (RuneLite's Blindfold plugin)";

/**
 * The upload as a cut-out (a PNG with a transparent background): a transparent image as it is, an opaque one with its
 * solid background keyed out. `key` is the colour taken out, null when the image was already transparent. Throws a
 * CutOutError when an opaque image's edge isn't one solid colour.
 */
export async function cutOut(input: Buffer, keying: KeyingOptions = DEFAULT_KEYING): Promise<{ image: Buffer; key: { r: number; g: number; b: number } | null }> {
  const image = sharp(input).rotate();
  if (!(await image.stats()).isOpaque) return { image: await image.png().toBuffer(), key: null };
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const key = edgeKey(data, info.width, info.height);
  if (!key) throw new CutOutError(NOT_SOLID_MESSAGE);
  keyOut(data, key, keying);
  return { image: await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer(), key };
}

/** The colour of the image's outer edge, or null when the edge isn't close enough to one colour. */
function edgeKey(data: Buffer, width: number, height: number): { r: number; g: number; b: number } | null {
  const ring = Math.max(2, Math.round(Math.min(width, height) * EDGE_RING));
  const edge: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) continue;
      edge.push((y * width + x) * 4);
    }
  }
  // The most common colour, give or take a little (JPEG noise): bucketed at 5 bits a channel, then averaged.
  const buckets = new Map<number, number[]>();
  for (const i of edge) {
    const b = ((data[i]! >> 3) << 10) | ((data[i + 1]! >> 3) << 5) | (data[i + 2]! >> 3);
    const list = buckets.get(b);
    if (list) list.push(i);
    else buckets.set(b, [i]);
  }
  let top: number[] = [];
  for (const list of buckets.values()) if (list.length > top.length) top = list;
  const mean = (c: number) => Math.round(top.reduce((sum, i) => sum + data[i + c]!, 0) / top.length);
  const key = { r: mean(0), g: mean(1), b: mean(2) };
  const matching = edge.filter((i) => distance(data, i, key) <= EDGE_MATCH).length;
  return matching >= edge.length * EDGE_SHARE ? key : null;
}

function distance(data: Buffer, i: number, key: { r: number; g: number; b: number }): number {
  return Math.hypot(data[i]! - key.r, data[i + 1]! - key.g, data[i + 2]! - key.b);
}

/**
 * Takes the key colour out of `data` (RGBA, in place). A fringe pixel's alpha is how little of the key's own colour is
 * in it: a colour-difference key (for a green key, green over the most of red and blue) measured against the key's, so
 * half green over a dark outline reads as half see-through, not as whatever its distance happens to be. A key with no
 * stand-out channel (a grey) falls back to the distance ramp. Then the key is taken back out of the colour
 * ("decontaminate": (pixel − (1 − alpha) × key) / alpha), or the outline keeps a green or magenta halo.
 */
function keyOut(data: Buffer, key: { r: number; g: number; b: number }, { tolerance, softness }: KeyingOptions): void {
  const k = [key.r, key.g, key.b];
  const peak = Math.max(...k);
  // The key's stand-out channels (a magenta has two), and the rest.
  const high = [0, 1, 2].filter((c) => k[c]! >= peak - 64);
  const low = [0, 1, 2].filter((c) => !high.includes(c));
  const keyness = (r: number, g: number, b: number) => {
    const p = [r, g, b];
    return Math.min(...high.map((c) => p[c]!)) - Math.max(...low.map((c) => p[c]!));
  };
  const keyKeyness = low.length ? keyness(key.r, key.g, key.b) : 0;
  const reach = tolerance + Math.max(1, softness);

  for (let i = 0; i < data.length; i += 4) {
    const d = distance(data, i, key);
    if (d >= reach) continue;
    let alpha: number;
    if (d <= tolerance) alpha = 0;
    else if (keyKeyness >= 48) alpha = 1 - keyness(data[i]!, data[i + 1]!, data[i + 2]!) / keyKeyness;
    else alpha = (d - tolerance) / (reach - tolerance);
    alpha = Math.min(1, Math.max(0, alpha));
    // Next to nothing: gone, rather than a speck blown up by the division below.
    if (alpha < 0.04) {
      data[i + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c]! - (1 - alpha) * k[c]!) / alpha)));
    data[i + 3] = Math.round(alpha * 255);
  }
}

/**
 * The sticker frames for one cut-out, as PNGs (transparent around the paper). Throws on an image with no transparent
 * background to cut around (see cutOut, which makes one from a solid-colour screenshot).
 */
export async function renderSticker(input: Buffer, options: StickerOptions = {}): Promise<Buffer[]> {
  const size = options.size ?? 720;
  const frameSpecs = options.frames ?? [
    { seed: 1, tilt: -1.4 },
    { seed: 2, tilt: 1.4 },
  ];

  // A plain screenshot (nothing cut out) would just get a paper frame around its rectangle.
  if ((await sharp(input).stats()).isOpaque) throw new CutOutError("A cut-out needs a transparent background around the art");
  // Trim to the cut-out, scale to fit, and leave room around it for the paper, the tear and the tilt.
  const trimmed = await sharp(input).ensureAlpha().trim({ threshold: 1 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const longest = Math.max(meta.width!, meta.height!);
  const inner = Math.round(size / (1 + 2 * (STROKE * 2.2 + 0.03)));
  const scale = inner / longest;
  const w = Math.max(1, Math.round(meta.width! * scale));
  const h = Math.max(1, Math.round(meta.height! * scale));
  const stroke = Math.max(3, STROKE * inner);
  const pad = Math.ceil(stroke * 2.2 + inner * 0.03);
  const W = w + 2 * pad;
  const H = h + 2 * pad;

  const art = await sharp(trimmed).resize(w, h).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer();
  const mask = new Uint8Array(W * H);
  let opaque = 0;
  for (let i = 0; i < W * H; i++) if (art[i * 4 + 3]! > 96) (mask[i] = 1), opaque++;
  if (opaque === 0) throw new Error("A cut-out needs some art in it");
  const dist = distanceTo(mask, W, H);

  const frames: Buffer[] = [];
  for (const { seed, tilt } of frameSpecs) {
    const random = rng(seed);
    const wobble = valueNoise(W, H, Math.max(6, stroke * 2.5), random);
    const jag = valueNoise(W, H, Math.max(2, stroke * 0.3), random, true);
    const rim = Math.max(1, stroke * 0.12);
    // The same paper texture on every frame (its own seed), so only the tear boils, not the grain.
    const textureRandom = rng(0x9a9e7);
    const mottle = valueNoise(W, H, Math.max(3, stroke * 0.8), textureRandom);
    // The paper: every pixel within `stroke` of the art, give or take the tear. Anti-aliased over one pixel.
    const paper = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const edge = stroke * (1 + WOBBLE * wobble[i]! + JAGGIES * jag[i]!);
      const a = Math.min(1, Math.max(0, edge - dist[i]! + 0.5));
      // How far inside the tear this pixel is: the outermost `rim` px are fibre-coloured, blending into the paper.
      const f = Math.min(1, Math.max(0, (edge - dist[i]!) / rim - 0.5));
      const tex = GRAIN * (textureRandom() * 2 - 1) + MOTTLE * mottle[i]!;
      const tone = (paperC: number, fibreC: number) => Math.max(0, Math.min(255, Math.round(fibreC + (paperC - fibreC) * f + tex)));
      paper[i * 4] = tone(PAPER.r, FIBRE.r);
      paper[i * 4 + 1] = tone(PAPER.g, FIBRE.g);
      paper[i * 4 + 2] = tone(PAPER.b, FIBRE.b);
      paper[i * 4 + 3] = Math.round(a * 255);
    }
    frames.push(
      await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([
          { input: paper, raw: { width: W, height: H, channels: 4 }, left: 0, top: 0 },
          { input: art, raw: { width: W, height: H, channels: 4 }, left: 0, top: 0 },
        ])
        .png()
        .toBuffer()
        // Tilted as a whole, paper and all, so the art stays stuck to its paper; then back onto the untilted canvas
        // size, so every frame lines up.
        .then((flat) => sharp(flat).rotate(tilt, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer({ resolveWithObject: true }))
        .then(({ data, info }) => {
          const left = Math.max(0, Math.floor((info.width - W) / 2));
          const top = Math.max(0, Math.floor((info.height - H) / 2));
          return sharp(data).extract({ left, top, width: Math.min(W, info.width), height: Math.min(H, info.height) }).png().toBuffer();
        }),
    );
  }
  return frames;
}

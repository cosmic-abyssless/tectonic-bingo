import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CutOutError, cutOut, renderSticker } from "./stickerEffect";

// A 60×100 opaque block on a transparent 100×140 canvas: something to stick on paper.
async function blockCutOut(): Promise<Buffer> {
  const block = await sharp({ create: { width: 60, height: 100, channels: 4, background: { r: 30, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
  return sharp({ create: { width: 100, height: 140, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: block, left: 20, top: 20 }])
    .png()
    .toBuffer();
}

describe("renderSticker", () => {
  it("makes two same-size frames, transparent around the paper, with different tears", async () => {
    const frames = await renderSticker(await blockCutOut(), { size: 200 });
    expect(frames).toHaveLength(2);
    const metas = await Promise.all(frames.map((f) => sharp(f).metadata()));
    expect(metas[0]!.width).toBe(metas[1]!.width);
    expect(metas[0]!.height).toBe(metas[1]!.height);
    for (const f of frames) {
      const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
      expect(data[3]).toBe(0); // a corner: no paper, no baked-in shadow
      const centre = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
      expect(data[centre + 3]).toBe(255);
    }
    expect(frames[0]!.equals(frames[1]!)).toBe(false);
  });

  it("is the same for the same seeds", async () => {
    const input = await blockCutOut();
    const [a, b] = await Promise.all([renderSticker(input, { size: 160 }), renderSticker(input, { size: 160 })]);
    expect(a[0]!.equals(b[0]!)).toBe(true);
  });

  it("refuses an image with nothing transparent to cut around", async () => {
    const opaque = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    await expect(renderSticker(opaque)).rejects.toThrow(/transparent/);
  });
});

const GREEN = [0, 255, 0];
const DARK = [40, 30, 20];

/**
 * A Blindfold-style screenshot, 100×100 opaque: a green background, a dark block (x 20–79, y 20–79) with a green gap
 * cut through its middle (x 45–54, y 30–69, not touching the edge), and a one-pixel anti-aliased column just left of
 * the block (x 19: half dark, half green).
 */
async function screenshot(background = GREEN): Promise<Buffer> {
  const w = 100;
  const data = Buffer.alloc(w * w * 3);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const inBlock = x >= 20 && x < 80 && y >= 20 && y < 80 && !(x >= 45 && x < 55 && y >= 30 && y < 70);
      const fringe = x === 19 && y >= 20 && y < 80;
      const c = inBlock ? DARK : fringe ? DARK.map((d, i) => Math.round((d + background[i]!) / 2)) : background;
      data.set(c, (y * w + x) * 3);
    }
  }
  return sharp(data, { raw: { width: w, height: w, channels: 3 } }).png().toBuffer();
}

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
}

describe("cutOut", () => {
  it("keeps a transparent image as it is", async () => {
    const { key } = await cutOut(await transparentImage());
    expect(key).toBeNull();
  });

  it("keys out a solid background everywhere, gaps inside the art included", async () => {
    const { image, key } = await cutOut(await screenshot());
    expect(key).toEqual({ r: 0, g: 255, b: 0 });
    const at = await pixels(image);
    expect(at(2, 2)[3]).toBe(0); // the background
    expect(at(50, 50)[3]).toBe(0); // the gap in the middle of the block
    expect(at(30, 30)).toEqual([...DARK, 255]); // the art, untouched
  });

  it("makes the anti-aliased fringe half see-through, with the key colour taken back out", async () => {
    const at = await pixels((await cutOut(await screenshot())).image);
    const [r, g, b, a] = at(19, 50);
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(160);
    // No green halo: the fringe's colour is the art's, not half green.
    for (const [got, want] of [[r, DARK[0]], [g, DARK[1]], [b, DARK[2]]] as const) expect(Math.abs(got! - want!)).toBeLessThanOrEqual(12);
  });

  it("works for a magenta background too", async () => {
    const at = await pixels((await cutOut(await screenshot([255, 0, 255]))).image);
    expect(at(2, 2)[3]).toBe(0);
    expect(at(19, 50)[1]).toBeLessThanOrEqual(DARK[1]! + 12);
  });

  it("refuses an opaque image whose edge isn't one solid colour", async () => {
    const noisy = await sharp(Buffer.from(Array.from({ length: 60 * 60 * 3 }, (_, i) => (i * 97) % 256)), { raw: { width: 60, height: 60, channels: 3 } }).png().toBuffer();
    await expect(cutOut(noisy)).rejects.toThrow(CutOutError);
    await expect(cutOut(noisy)).rejects.toThrow(/Blindfold/);
  });

  it("gives a keyed screenshot to renderSticker as a cut-out", async () => {
    const frames = await renderSticker((await cutOut(await screenshot())).image, { size: 160 });
    expect(frames).toHaveLength(2);
  });
});

function transparentImage(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
}

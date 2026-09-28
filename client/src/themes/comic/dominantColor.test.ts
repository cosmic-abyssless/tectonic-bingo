// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SAMPLE_SIZE, artSourceRect, extractDominantColor } from "./dominantColor";

type Rgb = [number, number, number];
type Img = { width: number; height: number; data: Uint8ClampedArray };

/** A synthetic tile image whose pixel at (x, y) is `paint(x, y)`, fully opaque. */
function makeImage(width: number, height: number, paint: (x: number, y: number) => Rgb): Img {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data.set([...paint(x, y), 255], i);
    }
  }
  return { width, height, data };
}

/**
 * Stands in for `ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)`:
 * each canvas pixel averages the source pixels that map into it (a box filter,
 * like a browser's downscale — so thin black text blends into a white panel as grey).
 */
function drawToSample(img: Img, { sx, sy, sw, sh }: ReturnType<typeof artSourceRect>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SAMPLE_SIZE * SAMPLE_SIZE * 4);
  for (let dy = 0; dy < SAMPLE_SIZE; dy++) {
    for (let dx = 0; dx < SAMPLE_SIZE; dx++) {
      const sum = [0, 0, 0, 0];
      let n = 0;
      for (let y = Math.floor(sy + (dy * sh) / SAMPLE_SIZE); y < sy + ((dy + 1) * sh) / SAMPLE_SIZE; y++) {
        for (let x = Math.floor(sx + (dx * sw) / SAMPLE_SIZE); x < sx + ((dx + 1) * sw) / SAMPLE_SIZE; x++) {
          const i = (y * img.width + x) * 4;
          for (let c = 0; c < 4; c++) sum[c]! += img.data[i + c]!;
          n++;
        }
      }
      out.set(
        sum.map((v) => Math.round(v / n)),
        (dy * SAMPLE_SIZE + dx) * 4,
      );
    }
  }
  return out;
}

const WHITE: Rgb = [250, 250, 250];
const BLACK: Rgb = [10, 10, 10];
const RED: Rgb = [200, 30, 40];

/** The comic-cover template: `art` above, a white caption panel with black text stripes across the bottom 30%. */
function comicCover(art: (x: number, y: number) => Rgb, size = 120): Img {
  const panelTop = size * 0.7;
  return makeImage(size, size, (x, y) => (y < panelTop ? art(x, y) : y % 3 === 0 ? BLACK : WHITE));
}

describe("artSourceRect", () => {
  it("covers the full width and the top 70% of the height", () => {
    expect(artSourceRect(400, 600)).toEqual({ sx: 0, sy: 0, sw: 400, sh: 420 });
  });
});

describe("extractDominantColor", () => {
  it("takes the art's colour, not the caption panel's", () => {
    const img = comicCover(() => RED);
    expect(extractDominantColor(drawToSample(img, artSourceRect(img.width, img.height)))).toBe("rgb(200, 30, 40)");
  });

  it("would pick the panel if the whole image were sampled (why the crop exists)", () => {
    // Busy art: no single colour covers as much of the image as the panel does.
    const bands: [number, Rgb][] = [
      [26, [40, 90, 200]],
      [48, [30, 160, 60]],
      [70, RED],
    ];
    const art = (_x: number, y: number) => bands.find(([bottom]) => y < bottom)![1];
    const img = makeImage(100, 100, (x, y) => (y < 70 ? art(x, y) : WHITE));

    const whole = extractDominantColor(drawToSample(img, { sx: 0, sy: 0, sw: 100, sh: 100 }));
    expect(whole).toBe("rgb(250, 250, 250)");
    expect(extractDominantColor(drawToSample(img, artSourceRect(100, 100)))).toBe("rgb(40, 90, 200)");
  });

  it("skips transparent pixels", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 0, 0, 0, 255, 255]);
    expect(extractDominantColor(data)).toBe("rgb(0, 0, 255)");
  });

  it("returns null when every pixel is transparent", () => {
    expect(extractDominantColor(new Uint8ClampedArray(SAMPLE_SIZE * SAMPLE_SIZE * 4))).toBeNull();
  });
});

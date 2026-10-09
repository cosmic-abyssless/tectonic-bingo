import { describe, expect, it } from "vitest";
import { frameArea, MAX_ZOOM, mixCamera, panCurve, panelCamera, PANEL_PAD, pullCurve, stageMode, toDesk, toScreen, whipCurve, WHIP_OVERSHOOT, WIDE_STAGE_MIN, type Insets, type Place } from "./camera";

const insets: Insets = { top: 10, right: 10, bottom: 60, left: 10 };
const stage = { w: 1200, h: 800 };
/** The middle of the stage's inner area. */
const middle = { x: 10 + (1200 - 20) / 2, y: 10 + (800 - 70) / 2 };
/** Where a point of a group lying at `place` lands on screen. */
const seen = (c: ReturnType<typeof frameArea>, place: Place, p: { x: number; y: number }) => toScreen(c, toDesk(place, p));

describe("the camera", () => {
  it("is a phone's below the wide width and a wide screen's from it", () => {
    expect(stageMode(WIDE_STAGE_MIN - 1)).toBe("phone");
    expect(stageMode(WIDE_STAGE_MIN)).toBe("wide");
  });

  it("frames an area of a straight group in the middle of the stage, as big as fits", () => {
    const place = { x: 0, y: 0, angle: 0 };
    const c = frameArea(stage, insets, place, { x: 0, y: 0, w: 840, h: 630 });
    // The height is the limit: 730 of 630.
    expect(c.scale).toBeCloseTo(730 / 630);
    const centre = seen(c, place, { x: 420, y: 315 });
    expect(centre.x).toBeCloseTo(middle.x);
    expect(centre.y).toBeCloseTo(middle.y);
  });

  it("squares a turned group up to the screen: its edges come out level", () => {
    const place = { x: 1500, y: -120, angle: 3 };
    const c = frameArea(stage, insets, place, { x: 0, y: 0, w: 840, h: 630 });
    expect(c.angle).toBeCloseTo(-3);
    const topLeft = seen(c, place, { x: 0, y: 0 });
    const topRight = seen(c, place, { x: 840, y: 0 });
    expect(topRight.y).toBeCloseTo(topLeft.y);
    expect(topRight.x - topLeft.x).toBeCloseTo(840 * c.scale);
    const centre = seen(c, place, { x: 420, y: 315 });
    expect(centre.x).toBeCloseTo(middle.x);
    expect(centre.y).toBeCloseTo(middle.y);
  });

  it("fills the screen with a panel, padded, but never zooms past the limit", () => {
    const place = { x: 900, y: 40, angle: -2 };
    const panel = { x: 440, y: 100, w: 380, h: 200 };
    const c = panelCamera(stage, insets, place, panel);
    expect(c.scale).toBeCloseTo(Math.min(1180 / (380 + 2 * PANEL_PAD), 730 / (200 + 2 * PANEL_PAD), MAX_ZOOM));
    const centre = seen(c, place, { x: 630, y: 200 });
    expect(centre.x).toBeCloseTo(middle.x);
    expect(centre.y).toBeCloseTo(middle.y);
    const tiny = panelCamera(stage, insets, place, { x: 0, y: 0, w: 10, h: 10 });
    expect(tiny.scale).toBe(MAX_ZOOM);
  });

  it("mixes two cameras, the angle along with the rest", () => {
    const a = { scale: 1, x: 0, y: 0, angle: 0 };
    const b = { scale: 2, x: 100, y: -50, angle: -4 };
    expect(mixCamera(a, b, 0.5)).toEqual({ scale: 1.5, x: 50, y: -25, angle: -2 });
  });
});

describe("the camera's moves", () => {
  it("whips a little past the panel, then eases back onto it", () => {
    expect(whipCurve(0)).toBe(0);
    expect(whipCurve(1)).toBe(1);
    const samples = Array.from({ length: 101 }, (_, i) => whipCurve(i / 100));
    expect(Math.max(...samples)).toBeCloseTo(WHIP_OVERSHOOT, 2);
    // The settle is smooth: after the peak it only ever comes back, a little at a time.
    const settle = samples.slice(63);
    for (let i = 1; i < settle.length; i++) {
      expect(settle[i]!).toBeLessThanOrEqual(settle[i - 1]!);
      expect(settle[i - 1]! - settle[i]!).toBeLessThan(0.01);
    }
  });

  it("pulls back and pans from 0 to 1 without going past", () => {
    for (const curve of [pullCurve, panCurve]) {
      expect(curve(0)).toBe(0);
      expect(curve(1)).toBe(1);
      for (let t = 0; t <= 1; t += 0.05) expect(curve(t)).toBeLessThanOrEqual(1);
    }
  });
});

import { describe, expect, it } from "vitest";
import { keepOnPage, mixCamera, overviewCamera, panelCamera, rectInPage, stageMode, unionRect, WIDE_STAGE_MIN, WRAPPED_PAGE_MIN_HEIGHT, WRAPPED_PAGE_WIDTH, type Insets } from "./camera";

const page = { w: WRAPPED_PAGE_WIDTH, h: WRAPPED_PAGE_MIN_HEIGHT };
const insets: Insets = { top: 10, right: 10, bottom: 60, left: 10 };
/** Where a page-coordinate point lands on screen. */
const at = (c: { scale: number; x: number; y: number }, p: { x: number; y: number }) => ({ x: c.x + p.x * c.scale, y: c.y + p.y * c.scale });

describe("the camera", () => {
  it("is a phone's below the wide width and a wide screen's from it", () => {
    expect(stageMode(WIDE_STAGE_MIN - 1)).toBe("phone");
    expect(stageMode(WIDE_STAGE_MIN)).toBe("wide");
  });

  it("centres the whole page, as big as fits", () => {
    const stage = { w: 600, h: 1400 };
    const c = overviewCamera(stage, page, insets);
    // A phone-width stage: the width is the limit, 580 of 420.
    expect(c.scale).toBeCloseTo(580 / 420);
    const centre = at(c, { x: page.w / 2, y: page.h / 2 });
    expect(centre.y).toBeCloseTo(10 + (1400 - 70) / 2);
  });

  it("leaves a wide screen's overview a little room to nudge in", () => {
    const stage = { w: 1200, h: 800 };
    const c = overviewCamera(stage, page, insets);
    // The height is the limit: 800 - 70 = 730 of 630, less the nudge's room.
    expect(c.scale).toBeCloseTo(730 / 630 / 1.035);
    const centre = at(c, { x: page.w / 2, y: page.h / 2 });
    expect(centre.x).toBeCloseTo(600);
    expect(centre.y).toBeCloseTo(10 + 365);
  });

  describe("on a phone", () => {
    const stage = { w: 390, h: 760 };

    it("frames a small panel so that it fills the width, and puts it in the middle", () => {
      const panel = { x: 30, y: 300, w: 240, h: 60 };
      const c = panelCamera({ stage, page, panel, mode: "phone", insets });
      expect(c.scale).toBeGreaterThan(overviewCamera(stage, page, insets).scale);
      // 370 of width for the 240 + 2 x 14 of the panel.
      expect(c.scale).toBeCloseTo(370 / 268, 2);
      // Its middle is the middle of the screen's inner area, while the page has room on both sides.
      const middle = at(c, { x: 150, y: 330 });
      expect(middle.x).toBeCloseTo(195);
    });

    it("never zooms past the limit, or out past the whole page", () => {
      const tiny = panelCamera({ stage, page, panel: { x: 100, y: 100, w: 20, h: 10 }, mode: "phone", insets });
      expect(tiny.scale).toBeLessThanOrEqual(2.4);
      const whole = panelCamera({ stage, page, panel: { x: 0, y: 0, w: page.w, h: page.h }, mode: "phone", insets });
      expect(whole.scale).toBeCloseTo(overviewCamera(stage, page, insets).scale);
    });

    it("keeps the page's edges on the screen: a panel at the top is framed with the page's top at the top", () => {
      const panel = { x: 100, y: 20, w: 160, h: 100 };
      const c = panelCamera({ stage, page, panel, mode: "phone", insets });
      expect(c.y).toBeLessThanOrEqual(insets.top + 0.001);
      expect(at(c, { x: 0, y: page.h }).y).toBeGreaterThanOrEqual(stage.h - insets.bottom - 0.001);
      expect(at(c, { x: 0, y: 0 }).y).toBeCloseTo(insets.top);
      // ...and its panel is still in view.
      expect(at(c, { x: 100, y: 120 }).y).toBeLessThan(stage.h - insets.bottom);
    });
  });

  describe("on a wide screen", () => {
    const stage = { w: 1280, h: 800 };
    const overview = overviewCamera(stage, page, insets);

    it("keeps the whole page in view and only nudges toward the panel", () => {
      const panel = { x: 20, y: 40, w: 380, h: 100 };
      const c = panelCamera({ stage, page, panel, mode: "wide", insets });
      expect(c.scale / overview.scale).toBeCloseTo(1.035);
      // The whole page stays in view, give or take the nudge's slack.
      expect(at(c, { x: 0, y: 0 }).y).toBeGreaterThanOrEqual(insets.top - 14.001);
      expect(at(c, { x: page.w, y: page.h }).y).toBeLessThanOrEqual(stage.h - insets.bottom + 14.001);
      expect(at(c, { x: 0, y: 0 }).x).toBeGreaterThan(0);
      expect(at(c, { x: page.w, y: 0 }).x).toBeLessThan(stage.w);
      // Shifted a little toward the panel, which is above the middle of the page: the page moves down.
      expect(c.y).toBeGreaterThan(overview.y);
    });
  });

  it("is the same for two panels at the same place, whatever else is on the page", () => {
    const panel = { x: 20, y: 200, w: 380, h: 100 };
    expect(panelCamera({ stage: { w: 390, h: 760 }, page, panel, mode: "phone", insets })).toEqual(panelCamera({ stage: { w: 390, h: 760 }, page, panel, mode: "phone", insets }));
  });
});

describe("camera helpers", () => {
  it("keeps a camera on the page, or centres the page where it is smaller than the screen", () => {
    const box = { x: 10, y: 10, w: 370, h: 690 };
    const smaller = keepOnPage({ scale: 0.5, x: 999, y: -999 }, box, page);
    expect(smaller.x).toBeCloseTo(10 + (370 - page.w * 0.5) / 2);
    expect(smaller.y).toBeCloseTo(10 + (690 - page.h * 0.5) / 2);
    const bigger = keepOnPage({ scale: 2, x: 500, y: 500 }, box, page);
    expect(bigger.x).toBe(10);
    expect(bigger.y).toBe(10);
    const far = keepOnPage({ scale: 2, x: -5000, y: -5000 }, box, page);
    expect(far.x).toBeCloseTo(10 + 370 - page.w * 2);
    expect(far.y).toBeCloseTo(10 + 690 - page.h * 2);
  });

  it("mixes two cameras", () => {
    expect(mixCamera({ scale: 1, x: 0, y: 0 }, { scale: 2, x: 100, y: 50 }, 0.5)).toEqual({ scale: 1.5, x: 50, y: 25 });
  });

  it("finds a panel's rect in page coordinates from screen rects, undoing the camera's scale", () => {
    expect(rectInPage({ x: 150, y: 260, w: 100, h: 40 }, { x: 50, y: 60, w: 840, h: 1260 }, 2)).toEqual({ x: 50, y: 100, w: 50, h: 20 });
  });

  it("unites rects, or none", () => {
    expect(unionRect([])).toBeNull();
    expect(unionRect([{ x: 10, y: 10, w: 20, h: 20 }, { x: 5, y: 40, w: 10, h: 10 }])).toEqual({ x: 5, y: 10, w: 25, h: 40 });
  });
});

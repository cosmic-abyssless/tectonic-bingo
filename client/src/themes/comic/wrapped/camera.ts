// The comic Wrapped's camera, as pure geometry. The book's page is laid out at a fixed width (WRAPPED_PAGE_WIDTH) in its
// own coordinates; the camera is the transform that puts a part of it on the stage (the screen under the header):
//
//   screen = (x, y) + scale × page
//
// On a phone the camera frames the current panel so it fills the screen. On a wide screen the whole page stays in view
// and the camera moves only a little toward the current panel.

/** The page's width in its own coordinates (px at scale 1), and the least height a page has (2:3, like the Tile book's). */
export const WRAPPED_PAGE_WIDTH = 420;
export const WRAPPED_PAGE_MIN_HEIGHT = 630;

export interface Size {
  w: number;
  h: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface Camera {
  scale: number;
  x: number;
  y: number;
}

export type StageMode = "phone" | "wide";

/** Below this stage width (px) the book is read a panel at a time, filling the screen. */
export const WIDE_STAGE_MIN = 760;

export const stageMode = (stageWidth: number): StageMode => (stageWidth < WIDE_STAGE_MIN ? "phone" : "wide");

/** The most the camera zooms in on a panel (a small panel on a phone isn't blown up past this). */
export const MAX_ZOOM = 2.4;
/** On a wide screen: how much closer than the whole page the camera gets, and how far it moves toward the panel. */
export const WIDE_NUDGE_ZOOM = 1.035;
export const WIDE_NUDGE_SHIFT = 0.18;

const inner = (stage: Size, insets: Insets): Rect => ({ x: insets.left, y: insets.top, w: Math.max(1, stage.w - insets.left - insets.right), h: Math.max(1, stage.h - insets.top - insets.bottom) });

/** The camera that puts `point` (in page coordinates) in the middle of `box` at `scale`. */
function centred(box: Rect, point: { x: number; y: number }, scale: number): Camera {
  return { scale, x: box.x + box.w / 2 - point.x * scale, y: box.y + box.h / 2 - point.y * scale };
}

/** The camera that puts `area` (in page coordinates) in the middle of the stage's inner area, as big as fits. */
function frame(stage: Size, insets: Insets, area: Rect, maxScale: number): Camera {
  const box = inner(stage, insets);
  const scale = Math.min(box.w / area.w, box.h / area.h, maxScale);
  return centred(box, { x: area.x + area.w / 2, y: area.y + area.h / 2 }, scale);
}

/**
 * The whole page in view, centred, as big as fits. On a wide screen a little smaller than that, so that the camera can
 * nudge in on a panel (WIDE_NUDGE_ZOOM) and still have the whole page in view.
 */
export function overviewCamera(stage: Size, page: Size, insets: Insets): Camera {
  const fit = frame(stage, insets, { x: 0, y: 0, w: page.w, h: page.h }, Infinity);
  if (stageMode(stage.w) === "phone") return fit;
  return centred(inner(stage, insets), { x: page.w / 2, y: page.h / 2 }, fit.scale / WIDE_NUDGE_ZOOM);
}

/** How far (px) the wide camera's nudge may carry a page's edge past the inner area. */
const WIDE_SLACK = 14;

/**
 * The camera for one panel (its rect in page coordinates). Phone: the panel, padded by `pad`, fills the inner area, kept
 * on the page. Wide: the overview, pushed in a touch and shifted a little toward the panel, the whole page still in view.
 */
export function panelCamera({ stage, page, panel, mode, insets, pad = 14 }: { stage: Size; page: Size; panel: Rect; mode: StageMode; insets: Insets; pad?: number }): Camera {
  const overview = overviewCamera(stage, page, insets);
  const box = inner(stage, insets);
  if (mode === "wide") {
    const scale = overview.scale * WIDE_NUDGE_ZOOM;
    const pageCentre = { x: page.w / 2, y: page.h / 2 };
    const panelCentre = { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 };
    const nudged = centred(box, { x: pageCentre.x + (panelCentre.x - pageCentre.x) * WIDE_NUDGE_SHIFT, y: pageCentre.y + (panelCentre.y - pageCentre.y) * WIDE_NUDGE_SHIFT }, scale);
    return keepOnPage(nudged, box, page, WIDE_SLACK);
  }
  const padded: Rect = { x: panel.x - pad, y: panel.y - pad, w: panel.w + 2 * pad, h: panel.h + 2 * pad };
  const camera = frame(stage, insets, padded, MAX_ZOOM);
  // Never further out than the whole page: a panel is a part of it.
  if (camera.scale < overview.scale) return overview;
  return keepOnPage(camera, box, page);
}

/**
 * The camera kept on the page: where the page is bigger than the screen it never moves so far that desk shows past one of
 * its edges, and where it is smaller it stays centred. So a panel near the top of a page is framed with the page's top
 * edge at the top of the screen, not in the middle of it. `slack` lets an edge go that far past the box.
 */
export function keepOnPage(camera: Camera, box: Rect, page: Size, slack = 0): Camera {
  const axis = (offset: number, pageSize: number, start: number, size: number) => {
    const scaled = pageSize * camera.scale;
    const lo = start + size - scaled - slack;
    const hi = start + slack;
    // A page smaller than the screen has no edge to keep on it: it stays in the middle.
    if (lo > hi) return start + (size - scaled) / 2;
    return Math.min(hi, Math.max(lo, offset));
  };
  return { scale: camera.scale, x: axis(camera.x, page.w, box.x, box.w), y: axis(camera.y, page.h, box.y, box.h) };
}

/** The camera partway between two (0 to 1), for a move that is drawn by hand rather than by the browser. */
export function mixCamera(a: Camera, b: Camera, t: number): Camera {
  return { scale: a.scale + (b.scale - a.scale) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export const cameraTransform = (c: Camera) => `translate(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px) scale(${c.scale.toFixed(4)})`;

/** A page-coordinate rect from an element's and its page's screen rects, undoing the camera's scale. */
export function rectInPage(el: Rect, page: Rect, scale: number): Rect {
  return { x: (el.x - page.x) / scale, y: (el.y - page.y) / scale, w: el.w / scale, h: el.h / scale };
}

/** The smallest rect holding all of them; null for none. */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

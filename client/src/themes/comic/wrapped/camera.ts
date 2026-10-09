// The comic Wrapped's camera, as pure geometry. The book's pages lie on a desk: each spread (or, on a phone, each page)
// is a group with its own place there, turned a little (desk.ts). The camera is the transform that puts a part of the
// desk on the stage (the screen under the header), turned so that the group it frames is square to the screen:
//
//   screen = (x, y) + scale × rotate(angle) × desk
//
// It always frames something whole: a panel, filling the screen as far as MAX_ZOOM lets it, or a whole group, when it
// pulls back at the end of a spread. Moving between them it whips (a fast move, a little past, easing back), pulls
// back (slowly out), or pans (across the desk to the next group).

/** A page's width in its own coordinates (px at scale 1), and the least height a page has (2:3). */
export const WRAPPED_PAGE_WIDTH = 420;
export const WRAPPED_PAGE_MIN_HEIGHT = 630;

export interface Point {
  x: number;
  y: number;
}
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
/** `angle` in degrees. */
export interface Camera {
  scale: number;
  x: number;
  y: number;
  angle: number;
}
/** Where a group lies on the desk: its own origin at (x, y), turned by `angle` degrees about it. */
export interface Place {
  x: number;
  y: number;
  angle: number;
}

export type StageMode = "phone" | "wide";

/** Below this stage width (px) the book is read a page at a time; from it, a spread at a time. */
export const WIDE_STAGE_MIN = 760;

export const stageMode = (stageWidth: number): StageMode => (stageWidth < WIDE_STAGE_MIN ? "phone" : "wide");

/** The most the camera zooms in on a panel (a small panel isn't blown up past this). */
export const MAX_ZOOM = 2.2;
/** The room (px, in page coordinates) the camera leaves around a panel it frames. */
export const PANEL_PAD = 14;

const rad = (deg: number) => (deg * Math.PI) / 180;
const rotate = (p: Point, deg: number): Point => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

const inner = (stage: Size, insets: Insets): Rect => ({ x: insets.left, y: insets.top, w: Math.max(1, stage.w - insets.left - insets.right), h: Math.max(1, stage.h - insets.top - insets.bottom) });

/** A point of a group (its own coordinates) on the desk. */
export function toDesk(place: Place, p: Point): Point {
  const r = rotate(p, place.angle);
  return { x: place.x + r.x, y: place.y + r.y };
}

/** Where a point on the desk lands on the screen. */
export function toScreen(camera: Camera, p: Point): Point {
  const r = rotate(p, camera.angle);
  return { x: camera.x + r.x * camera.scale, y: camera.y + r.y * camera.scale };
}

/**
 * The camera that shows `area` (in the coordinates of a group lying at `place`) square to the screen, centred in the
 * stage's inner area and as big as fits, up to `maxScale`.
 */
export function frameArea(stage: Size, insets: Insets, place: Place, area: Rect, maxScale = Infinity): Camera {
  const box = inner(stage, insets);
  const scale = Math.min(box.w / area.w, box.h / area.h, maxScale);
  // Turned back by the group's angle, a point of the group is the group's origin (turned back) plus the point itself.
  const angle = -place.angle;
  const origin = rotate({ x: place.x, y: place.y }, angle);
  const centre = { x: area.x + area.w / 2, y: area.y + area.h / 2 };
  return { scale, angle, x: box.x + box.w / 2 - scale * (origin.x + centre.x), y: box.y + box.h / 2 - scale * (origin.y + centre.y) };
}

/** The camera on a panel: its rect (in its group's coordinates), padded, filling the screen as far as MAX_ZOOM lets it. */
export function panelCamera(stage: Size, insets: Insets, place: Place, panel: Rect): Camera {
  return frameArea(stage, insets, place, { x: panel.x - PANEL_PAD, y: panel.y - PANEL_PAD, w: panel.w + 2 * PANEL_PAD, h: panel.h + 2 * PANEL_PAD }, MAX_ZOOM);
}

/** The camera partway between two (0 to 1, or a little past 1 for an overshoot), for a move drawn by hand. */
export function mixCamera(a: Camera, b: Camera, t: number): Camera {
  return { scale: a.scale + (b.scale - a.scale) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: a.angle + (b.angle - a.angle) * t };
}

export const cameraTransform = (c: Camera) => `translate(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px) rotate(${c.angle.toFixed(3)}deg) scale(${c.scale.toFixed(4)})`;

/** Whether two cameras show the same thing, near enough that moving between them isn't worth drawing. */
export const sameCamera = (a: Camera, b: Camera) => Math.abs(a.scale - b.scale) < 0.004 && Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5 && Math.abs(a.angle - b.angle) < 0.05;

// ---- the moves' curves: time (0 to 1) to how far along the move (0 to 1) ----------------------------------------------

/** How far a whip carries past its panel before settling back, and when in the move it gets there. */
export const WHIP_OVERSHOOT = 1.07;
const WHIP_PEAK_AT = 0.62;

const easeInOutQuart = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** A whip: fast out and in to a little past the panel, then eased back onto it. */
export function whipCurve(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < WHIP_PEAK_AT) return easeInOutQuart(t / WHIP_PEAK_AT) * WHIP_OVERSHOOT;
  return WHIP_OVERSHOOT + (1 - WHIP_OVERSHOOT) * easeInOutCubic((t - WHIP_PEAK_AT) / (1 - WHIP_PEAK_AT));
}

/** Pulling back: off at once, easing out to the whole spread. */
export const pullCurve = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** Panning across the desk: slow away, fast across, slow in. */
export const panCurve = (t: number) => easeInOutQuart(Math.min(1, Math.max(0, t)));

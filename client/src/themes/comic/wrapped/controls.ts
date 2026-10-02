// The comic Wrapped's controls, as pure functions: what a key, a wheel gesture, a tap or a swipe means for the book.
// Forward (to the next panel): scroll down, Space, → or ↓, a tap on the right side, a swipe left. Back is the reverse.

export type Nav = "next" | "prev";

const FORWARD_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown"]);
const BACK_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp"]);

export interface KeyInfo {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** The element that has focus: a key means something else to a field, and Space and Enter press a focused button. */
  target: { tagName: string; isContentEditable?: boolean; role?: string | null } | null;
}

const FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const PRESSABLE_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);

/** What a key does to the book, or null when it isn't the book's: a shortcut of the browser's, or a key meant for a field. */
export function keyNav(e: KeyInfo): Nav | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const tag = e.target?.tagName.toUpperCase();
  if (tag && FIELD_TAGS.has(tag)) return null;
  if (e.target?.isContentEditable) return null;
  if (e.key === " " || e.key === "Spacebar") {
    // Space on a focused button or link presses it.
    if ((tag && PRESSABLE_TAGS.has(tag)) || e.target?.role === "button") return null;
    return e.shiftKey ? "prev" : "next";
  }
  if (e.shiftKey) return null;
  // An arrow on a focused control that uses it (a slider, a menu) is the control's.
  if (e.target?.role && ["slider", "menu", "menuitem", "listbox", "tab", "radio"].includes(e.target.role)) return null;
  if (FORWARD_KEYS.has(e.key)) return "next";
  if (BACK_KEYS.has(e.key)) return "prev";
  return null;
}

/** Which way a tap at `x` across a stage `width` wide goes: the right third forward, the left third back, the middle nothing. */
export function tapNav(x: number, width: number): Nav | null {
  if (width <= 0) return null;
  const at = x / width;
  if (at >= 2 / 3) return "next";
  if (at <= 1 / 3) return "prev";
  return null;
}

/** How far (px) a finger has to travel across for it to be a swipe, and how much more across than along. */
export const SWIPE_MIN = 48;
export const SWIPE_DOMINANCE = 1.4;
/** A touch that moves less than this (px) and is over within TAP_MAX_MS is a tap. */
export const TAP_SLOP = 10;
export const TAP_MAX_MS = 500;

/** A swipe's meaning: across to the left goes forward, to the right back. Null for a short or mostly vertical drag. */
export function swipeNav(dx: number, dy: number): Nav | null {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return null;
  return dx < 0 ? "next" : "prev";
}

/** Whether a touch is a tap rather than a drag. */
export const isTap = (dx: number, dy: number, ms: number) => Math.hypot(dx, dy) <= TAP_SLOP && ms <= TAP_MAX_MS;

/** Markup that takes a tap for itself: a tap on a button, link or field is that control's, not the book's. */
export const INTERACTIVE_SELECTOR = "button, a[href], input, select, textarea, summary, label, [role='button'], [role='link'], [data-no-tap]";

// ---- The scroll wheel ----------------------------------------------------------------------------------------------

/** A pause this long (ms) with no wheel events ends a gesture. */
export const WHEEL_QUIET_MS = 180;
/** A gesture has to add up to this much scrolling before it moves the book: a brush of the wheel isn't one. */
export const WHEEL_MIN = 8;
/** A push this much stronger than the one before it, in the tail of an earlier one, is a new gesture... */
export const WHEEL_REARM_RATIO = 1.5;
/** ...as long as it is at least this big and this long (ms) after the last move. */
export const WHEEL_REARM_MIN = 40;
export const WHEEL_REARM_AFTER_MS = 250;
/** An event this small (px), within this long (ms) of the last, carries on a faded gesture however long the gap. */
export const WHEEL_TAIL_MAX = 40;
export const WHEEL_TAIL_GAP_MS = 600;
/** Scrolling the other way is a new gesture too, once this long (ms) after the last move. */
export const WHEEL_REVERSE_AFTER_MS = 120;

/**
 * Turns the wheel's stream of events into one move per gesture, so one hard flick of a trackpad (a burst of events that
 * rises, then fades over a second or more as it coasts) moves exactly one panel, never skipping a page. A gesture is
 * the events until the wheel has been quiet for WHEEL_QUIET_MS. Inside one, a clearly new push (the deltas climbing
 * again after they had faded, or the other way) is told apart from the coasting and moves again.
 */
export class WheelGesture {
  private lastAt = -Infinity;
  private firedAt = -Infinity;
  private lastAbs = 0;
  private peak = 0;
  private dir = 0;
  private fired = false;
  private faded = false;
  private sum = 0;

  /** Feed one wheel event's vertical delta (pixels) at time `now` (ms); returns the move it starts, if any. */
  feed(deltaY: number, now: number): Nav | null {
    const abs = Math.abs(deltaY);
    if (abs === 0) return null;
    const dir = Math.sign(deltaY);
    const faded = this.faded || abs < this.lastAbs * 0.6 || abs < this.peak * 0.6;
    let quiet = now - this.lastAt > WHEEL_QUIET_MS;
    // The long tail of a flick's coasting can have gaps wider than a pause (browsers thin the events out as they fade): a
    // small event that carries on from a faded one, the same way, soon after the move, is still that gesture.
    if (quiet && this.fired && faded && abs < WHEEL_TAIL_MAX && dir === this.dir && now - this.lastAt < WHEEL_TAIL_GAP_MS) quiet = false;
    if (quiet) {
      this.fired = false;
      this.faded = false;
      this.sum = 0;
      this.peak = 0;
    }
    const reversed = !quiet && this.fired && dir !== this.dir && now - this.firedAt > WHEEL_REVERSE_AFTER_MS;
    if (reversed) {
      this.fired = false;
      this.sum = 0;
    }
    this.faded = !quiet && faded;
    const rearm = !quiet && this.fired && this.faded && abs >= WHEEL_REARM_MIN && abs > this.lastAbs * WHEEL_REARM_RATIO && now - this.firedAt > WHEEL_REARM_AFTER_MS && dir === this.dir;
    if (rearm) {
      this.fired = false;
      this.faded = false;
      this.sum = 0;
      this.peak = 0;
    }

    this.lastAt = now;
    this.lastAbs = abs;
    this.peak = Math.max(this.peak, abs);
    this.dir = dir;
    this.sum += deltaY;
    if (this.fired || Math.abs(this.sum) < WHEEL_MIN) return null;
    this.fired = true;
    this.firedAt = now;
    this.faded = false;
    this.peak = abs;
    return this.sum > 0 ? "next" : "prev";
  }

  /** Forget the gesture in progress (the book was left, or something else took the wheel). */
  reset() {
    this.lastAt = -Infinity;
    this.fired = false;
    this.faded = false;
    this.sum = 0;
    this.peak = 0;
    this.lastAbs = 0;
  }
}

/** A wheel event's vertical delta in pixels, whatever its unit (lines and pages are what some mice send). */
export function wheelPixels(e: { deltaY: number; deltaMode: number }, pageHeight: number): number {
  if (e.deltaMode === 1) return e.deltaY * 40;
  if (e.deltaMode === 2) return e.deltaY * pageHeight;
  return e.deltaY;
}

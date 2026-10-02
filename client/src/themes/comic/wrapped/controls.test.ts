import { describe, expect, it } from "vitest";
import { isTap, keyNav, swipeNav, tapNav, WheelGesture, wheelPixels, type KeyInfo, type Nav } from "./controls";

const key = (k: string, extra: Partial<KeyInfo> = {}): KeyInfo => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: "DIV" }, ...extra });

/** Feeds `events` (delta, time ms) to a fresh gesture and returns the moves, with the time each was made. */
function moves(events: [number, number][]): [Nav, number][] {
  const gesture = new WheelGesture();
  const out: [Nav, number][] = [];
  for (const [delta, at] of events) {
    const nav = gesture.feed(delta, at);
    if (nav) out.push([nav, at]);
  }
  return out;
}

/** A trackpad flick: the deltas climb, then coast away over a second or more, one event a frame. */
const flick = (start: number, sign = 1): [number, number][] => {
  const deltas = [4, 12, 30, 60, 100, 140, 160, 150, 130, 110, 90, 70, 55, 40, 30, 22, 16, 12, 8, 6, 4, 3, 2, 1];
  return deltas.map((d, i) => [d * sign, start + i * 16]);
};

describe("keyNav", () => {
  it("goes forward on Space, → and ↓, and back on Shift+Space, ← and ↑", () => {
    expect(["ArrowRight", "ArrowDown", "PageDown", " "].map((k) => keyNav(key(k)))).toEqual(["next", "next", "next", "next"]);
    expect(["ArrowLeft", "ArrowUp", "PageUp"].map((k) => keyNav(key(k)))).toEqual(["prev", "prev", "prev"]);
    expect(keyNav(key(" ", { shiftKey: true }))).toBe("prev");
  });

  it("leaves browser shortcuts, fields and the controls that use a key to themselves", () => {
    expect(keyNav(key("ArrowRight", { ctrlKey: true }))).toBeNull();
    expect(keyNav(key("ArrowLeft", { altKey: true }))).toBeNull();
    expect(keyNav(key("ArrowDown", { target: { tagName: "INPUT" } }))).toBeNull();
    expect(keyNav(key(" ", { target: { tagName: "TEXTAREA" } }))).toBeNull();
    expect(keyNav(key("ArrowRight", { target: { tagName: "DIV", isContentEditable: true } }))).toBeNull();
    // Space presses a focused button or link; an arrow in a menu moves in the menu.
    expect(keyNav(key(" ", { target: { tagName: "BUTTON" } }))).toBeNull();
    expect(keyNav(key(" ", { target: { tagName: "A" } }))).toBeNull();
    expect(keyNav(key("ArrowDown", { target: { tagName: "DIV", role: "menuitem" } }))).toBeNull();
    // ...but an arrow with a button focused still turns the page.
    expect(keyNav(key("ArrowRight", { target: { tagName: "BUTTON" } }))).toBe("next");
    expect(keyNav(key("Enter"))).toBeNull();
    expect(keyNav(key("a"))).toBeNull();
  });
});

describe("taps and swipes", () => {
  it("a tap on the right third goes forward, on the left third back, in the middle nowhere", () => {
    expect(tapNav(380, 390)).toBe("next");
    expect(tapNav(10, 390)).toBe("prev");
    expect(tapNav(195, 390)).toBeNull();
    expect(tapNav(5, 0)).toBeNull();
  });

  it("a swipe left goes forward and right back; short or vertical drags are neither", () => {
    expect(swipeNav(-120, 10)).toBe("next");
    expect(swipeNav(120, -10)).toBe("prev");
    expect(swipeNav(-30, 0)).toBeNull();
    expect(swipeNav(-100, 100)).toBeNull();
  });

  it("tells a tap from a drag", () => {
    expect(isTap(2, 3, 120)).toBe(true);
    expect(isTap(30, 0, 100)).toBe(false);
    expect(isTap(0, 0, 900)).toBe(false);
  });
});

describe("WheelGesture: one gesture, one panel", () => {
  it("moves once for a hard trackpad flick however long it coasts", () => {
    expect(moves(flick(1000))).toEqual([["next", expect.any(Number)]]);
    expect(moves(flick(1000, -1))).toEqual([["prev", expect.any(Number)]]);
  });

  it("moves once for the same flick as Chrome really delivers it: smoothed, with the tail's events thinning out", () => {
    // Recorded from a synthetic flick in Chromium: gaps of 200ms and more appear while it fades.
    const recorded: [number, number][] = [[5, 4155], [15, 4203], [30, 4350], [50, 4456], [70, 4572], [80, 4687], [75, 4761], [65, 4845], [55, 4945], [45, 5028], [35, 5111], [27.5, 5308], [20, 5539], [15, 5633], [11, 5725], [8, 5796], [6, 5862], [4, 5928], [3, 5997], [2, 6078], [1.5, 6284], [1, 6364]];
    expect(moves(recorded)).toHaveLength(1);
  });

  it("moves once for a mouse wheel spun quickly, and once for each slow notch", () => {
    const spun = Array.from({ length: 12 }, (_, i): [number, number] => [100, 1000 + i * 40]);
    expect(moves(spun)).toHaveLength(1);
    const notches = [0, 400, 800, 1200].map((t): [number, number] => [100, 1000 + t]);
    expect(moves(notches)).toHaveLength(4);
  });

  it("moves again for a second flick after a pause, in the other direction too", () => {
    const events = [...flick(0), ...flick(2500, -1)];
    expect(moves(events).map(([nav]) => nav)).toEqual(["next", "prev"]);
  });

  it("moves again for a new flick that starts while the last is still coasting", () => {
    const first = flick(0);
    // 480ms in, the first is fading (deltas about 50), and a new hard push begins.
    const second: [number, number][] = [[20, 500], [90, 516], [150, 532], [170, 548], [140, 564], [100, 580], [70, 596], [40, 612], [20, 628]];
    const events = [...first.filter(([, t]) => t < 480), ...second];
    expect(moves(events)).toHaveLength(2);
  });

  it("ignores a brush of the wheel too small to mean it", () => {
    expect(moves([[2, 0], [1, 30], [2, 60]])).toHaveLength(0);
  });

  it("is reset by reset()", () => {
    const gesture = new WheelGesture();
    expect(gesture.feed(100, 0)).toBe("next");
    expect(gesture.feed(100, 30)).toBeNull();
    gesture.reset();
    expect(gesture.feed(100, 60)).toBe("next");
  });

  it("reads a wheel's lines and pages as pixels", () => {
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 }, 800)).toBe(120);
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 }, 800)).toBe(800);
    expect(wheelPixels({ deltaY: 53, deltaMode: 0 }, 800)).toBe(53);
  });
});

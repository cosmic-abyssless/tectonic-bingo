import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTutorial, type TutorialModel, type TutorialStep } from "../../headless";
import { useSlot, useThemeTokens } from "../../themes/context";
import { tokensToCssVars } from "../../themes/tokens";
import { useIsPhone } from "../ui/useMediaQuery";

// Room around the highlighted element, between it and the card, and from the window's edges.
const PAD = 6;
const GAP = 12;
const EDGE = 16;
const CARD_WIDTH = 352;
// How long an optional step waits for its element (a Tile's page turning to it, the Submit flow's fields mounting)
// before passing over it.
const WAIT_MS = 1500;
// The same, inside a Submit flow or ☰ the last step was already in: nothing there is still to come (no pages turn), so
// an element that isn't there by now won't be (the Proof screenshot choice, on a Tile that doesn't need one).
const WAIT_IN_OPEN_MS = 150;
/**
 * How long the element has to hold still before its highlight and the card show: a Tile's book flies in, a dialog grows,
 * and following every frame of that made the card jump about. Past SETTLE_MAX_MS it shows wherever the element is.
 */
const SETTLE_MS = 150;
const SETTLE_MAX_MS = 1200;
/**
 * Once shown, how long the element may go missing (the comic book lays a see-through layer over it for a moment after it
 * lands) before the highlight drops. A step that ends because its dialog closed is replaced by its own logic, not this.
 */
const GRACE_MS = 1000;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The Tutorial (CONTEXT.md) over the Board: the current step's element highlighted, everything else dimmed and
 * unclickable, and the step's card (the theme's TutorialCard) beside it, or at the bottom on a phone. Only a step's
 * ✋ element (and Task interest) takes clicks. It sits above the dialogs and the ☰ menu (react-aria places its popovers
 * at z-index 100000), portalled to body, and is marked as a react-aria top layer, so an open Tile, Submit flow or ☰
 * doesn't treat its clicks as clicks outside, or keep focus from it.
 */
export function TutorialOverlay() {
  const tutorial = useTutorial();
  // The card's height on the last step, for scrolling a step's element clear of it before its own card is up.
  const lastCardHeight = useRef(0);
  // Which step came before this one, and what it was inside (see WAIT_IN_OPEN_MS).
  const steps = useRef<{ id: string | null; inside: TutorialStep["inside"]; before: TutorialStep["inside"] }>({ id: null, inside: null, before: null });
  if (!tutorial?.active || !tutorial.step || !tutorial.card) return null;
  const step = tutorial.step;
  if (steps.current.id !== step.id) steps.current = { id: step.id, inside: step.inside, before: steps.current.inside };
  const alreadyOpen = (step.inside === "submit" || step.inside === "menu") && steps.current.before === step.inside;
  return createPortal(<TutorialLayer key={step.id} tutorial={tutorial} step={step} lastCardHeight={lastCardHeight} waitMs={alreadyOpen ? WAIT_IN_OPEN_MS : WAIT_MS} />, document.body);
}

function TutorialLayer({ tutorial, step, lastCardHeight, waitMs }: { tutorial: TutorialModel; step: TutorialStep; lastCardHeight: RefObject<number>; waitMs: number }) {
  const TutorialCard = useSlot("TutorialCard");
  const tokens = useThemeTokens();
  const phone = useIsPhone();
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [hole, setHole] = useState<Box | null>(null);
  const [view, setView] = useState({ width: window.innerWidth, height: window.innerHeight, cardHeight: 0 });
  // An optional step shows its card once its element turns up (it may yet be passed over).
  const [found, setFound] = useState(false);
  const pass = useRef(tutorial.pass);
  pass.current = tutorial.pass;
  // When the step started, and whether its element has turned up: kept across the effect running again (StrictMode).
  const started = useRef(performance.now());
  const seen = useRef(false);
  // Holding still: where the element last was, since when, and when it was last seen (see SETTLE_MS, GRACE_MS).
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);
  const candidate = useRef<Box | null>(null);
  const stillSince = useRef(0);
  const lastSeen = useRef(0);

  // Follows the element every frame: the page scrolls, a Tile's book flies in and turns its pages, dialogs grow. (And
  // measures the card, to place it.)
  useLayoutEffect(() => {
    let frame = 0;
    const tick = () => {
      const root = rootRef.current;
      const cardHeight = cardRef.current?.offsetHeight ?? 0;
      if (cardHeight) lastCardHeight.current = cardHeight;
      setView((v) => (v.width === window.innerWidth && v.height === window.innerHeight && v.cardHeight === cardHeight ? v : { width: window.innerWidth, height: window.innerHeight, cardHeight }));
      const els = root && step.targets.length > 0 ? findTargets(step.targets, step.all, root) : [];
      if (els.length > 0) {
        if (!seen.current) {
          seen.current = true;
          setFound(true);
          bringIntoView(els[0], root!, phone ? (cardHeight || lastCardHeight.current) + 2 * EDGE : 0);
        }
        const r = bounds(els.map((el) => shownRect(el, root!)));
        // No room around an edge that's under something (the sticky header): a click there would reach it.
        const top = r.coveredTop ? r.top : r.top - PAD;
        const bottom = r.coveredBottom ? r.bottom : r.bottom + PAD;
        const next = { top, left: r.left - PAD, width: r.right - r.left + 2 * PAD, height: bottom - top };
        const now = performance.now();
        lastSeen.current = now;
        if (!candidate.current || !sameBox(candidate.current, next)) {
          candidate.current = next;
          stillSince.current = now;
        }
        if (!settledRef.current && (now - stillSince.current >= SETTLE_MS || now - started.current >= SETTLE_MAX_MS)) {
          settledRef.current = true;
          setSettled(true);
        }
        if (settledRef.current) setHole((h) => (h && sameBox(h, next) ? h : next));
      } else if (settledRef.current && performance.now() - lastSeen.current < GRACE_MS) {
        // Missing for a moment: keep the highlight where it was.
      } else {
        setHole(null);
        // Gone before it held still: its wait starts over when it's back.
        if (!settledRef.current) candidate.current = null;
        // Never turned up (or never held still): show the card anyway, over the dimmed page, as before.
        if (!settledRef.current && performance.now() - started.current >= SETTLE_MAX_MS) {
          settledRef.current = true;
          setSettled(true);
        }
        if (!seen.current && step.optional && performance.now() - started.current > waitMs) {
          pass.current();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
    // Keyed by step: runs once per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A step with an element waits for it to hold still (SETTLE_MS); the card is measured meanwhile, just not shown.
  const showCard = found || !step.optional || step.targets.length === 0;
  const cardReady = settled || step.targets.length === 0;
  const card = tutorial.card!;
  // Inside the ☰ the card goes beside the menu: below an entry, it would cover the entries still to come.
  const cardStyle = placeCard(hole, view, phone, step.inside === "menu");
  const dim = "color-mix(in srgb, var(--color-scrim) 55%, transparent)";

  return (
    <div ref={rootRef} data-react-aria-top-layer="true" className="pointer-events-none fixed inset-0 z-[100001]" style={tokensToCssVars(tokens)}>
      {hole ? (
        <>
          {/* The dimming, cut around the element, and its outline. */}
          <div className="absolute rounded-md" style={{ ...boxStyle(hole), boxShadow: `0 0 0 200vmax ${dim}`, outline: "2px solid var(--color-accent)" }} />
          {/* Everything but the element takes (and drops) the clicks; the element too, unless the step lets it be clicked. */}
          {blockers(hole, view, step.clickable).map((b, i) => (
            <div key={i} className="pointer-events-auto absolute" style={boxStyle(b)} />
          ))}
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0" style={{ background: dim }} />
      )}

      {showCard && (
        <div ref={cardRef} role="dialog" aria-label={card.title} className="pointer-events-auto absolute" style={{ ...cardStyle, visibility: cardReady ? undefined : "hidden" }}>
          <TutorialCard card={card} />
        </div>
      )}
    </div>
  );
}

/**
 * The element to highlight: the first of the step's targets with one on screen (not hidden, and not under something
 * else), and with `all`, every one of that target's on screen.
 */
function findTargets(targets: string[], all: boolean, overlay: HTMLElement): HTMLElement[] {
  for (const target of targets) {
    const shown = [...document.querySelectorAll<HTMLElement>(`[data-tutorial="${target}"]`)].filter((el) => isShown(el, overlay));
    if (shown.length > 0) return all ? shown : shown.slice(0, 1);
  }
  return [];
}

interface ShownRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** An edge cut back to where the element stops being under something. */
  coveredTop: boolean;
  coveredBottom: boolean;
}

/**
 * Where the element shows: its box, with the top or bottom cut back to where it's the topmost thing on screen, so the
 * highlight (and, on a ✋ step, the way through for clicks) doesn't take in a sticky header it has scrolled under.
 */
function shownRect(el: HTMLElement, overlay: HTMLElement): ShownRect {
  const r = el.getBoundingClientRect();
  const rect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, coveredTop: false, coveredBottom: false };
  const top = Math.max(r.top, 0);
  const bottom = Math.min(r.bottom, window.innerHeight);
  if (bottom <= top) return rect;
  const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
  const onTop = (y: number) => {
    const hit = document.elementsFromPoint(x, y).find((h) => !overlay.contains(h));
    return !!hit && el.contains(hit);
  };
  if (!onTop(top + 1)) {
    let y = top;
    while (y < bottom && !onTop(y + 1)) y += 4;
    Object.assign(rect, { top: y, coveredTop: true });
  }
  if (!onTop(bottom - 1)) {
    let y = bottom;
    while (y > rect.top && !onTop(y - 1)) y -= 4;
    Object.assign(rect, { bottom: y, coveredBottom: true });
  }
  return rect;
}

function bounds(rects: ShownRect[]): ShownRect {
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return {
    top,
    bottom,
    left: Math.min(...rects.map((r) => r.left)),
    right: Math.max(...rects.map((r) => r.right)),
    coveredTop: rects.some((r) => r.top === top && r.coveredTop),
    coveredBottom: rects.some((r) => r.bottom === bottom && r.coveredBottom),
  };
}

function sameBox(a: Box, b: Box): boolean {
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

function isShown(el: HTMLElement, overlay: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const left = Math.max(r.left, 0);
  const right = Math.min(r.right, window.innerWidth);
  const top = Math.max(r.top, 0);
  const bottom = Math.min(r.bottom, window.innerHeight);
  // Scrolled away, off the window or out of the dialog it's in: it's there (it gets scrolled to) unless it's hidden.
  if (right <= left || bottom <= top || scrolledAway(el)) return el.checkVisibility?.({ visibilityProperty: true }) ?? true;
  // On screen: whatever's on top at its middle has to be it (not a page stacked over it, or a dialog's backdrop), or
  // its dialog's sticky header, which scrolling it to the middle brings it out from under.
  const topmost = topmostAt(el, overlay);
  return !!topmost && (el.contains(topmost) || underStickyHeader(el, topmost));
}

/** What's on top at the middle of the part of the element in the window, the overlay aside. */
function topmostAt(el: HTMLElement, overlay: HTMLElement): Element | undefined {
  const r = el.getBoundingClientRect();
  const x = (Math.max(r.left, 0) + Math.min(r.right, window.innerWidth)) / 2;
  const y = (Math.max(r.top, 0) + Math.min(r.bottom, window.innerHeight)) / 2;
  return document.elementsFromPoint(x, y).find((hit) => !overlay.contains(hit));
}

function underStickyHeader(el: HTMLElement, topmost: Element): boolean {
  const box = scrollBox(el);
  if (!box?.contains(topmost)) return false;
  for (let e: Element | null = topmost; e && e !== box; e = e.parentElement) {
    if (getComputedStyle(e).position === "sticky") return true;
  }
  return false;
}

function scrollBox(el: HTMLElement): HTMLElement | null {
  for (let box = el.parentElement; box && box !== document.body; box = box.parentElement) {
    const { overflowY } = getComputedStyle(box);
    if (overflowY === "auto" || overflowY === "scroll") return box;
  }
  return null;
}

/** It isn't wholly inside the nearest scrolling box it's in (the Submit flow, scrolled short of it or past it). */
function scrolledAway(el: HTMLElement): boolean {
  const box = scrollBox(el);
  if (!box) return false;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  return r.top < b.top - 1 || r.bottom > b.bottom + 1;
}

/**
 * Scrolls the element to the middle of the page, or of the dialog it's in, unless it already shows whole (clear of the
 * card at the bottom of a phone's screen, `below`). The middle, not the nearest edge: a dialog's header sits over its
 * top edge.
 */
function bringIntoView(el: HTMLElement, overlay: HTMLElement, below: number) {
  const room = window.innerHeight - below;
  const r = el.getBoundingClientRect();
  // Taller than the room there is (the whole Board): as long as some of it shows, leave it where it is.
  if (r.height > room && r.bottom > 0 && r.top < room) return;
  const topmost = topmostAt(el, overlay);
  if (r.top >= 0 && r.bottom <= room && !scrolledAway(el) && !!topmost && el.contains(topmost)) return;
  el.scrollIntoView({ block: "center", inline: "nearest" });
}

function boxStyle(b: Box): CSSProperties {
  return { top: b.top, left: b.left, width: b.width, height: b.height };
}

/** The four boxes around the hole, and the hole itself when its element isn't to be clicked. */
function blockers(hole: Box, view: { width: number; height: number }, clickable: boolean): Box[] {
  const top = Math.max(0, hole.top);
  const bottom = Math.min(view.height, hole.top + hole.height);
  const left = Math.max(0, hole.left);
  const right = Math.min(view.width, hole.left + hole.width);
  return [
    { top: 0, left: 0, width: view.width, height: top },
    { top: bottom, left: 0, width: view.width, height: Math.max(0, view.height - bottom) },
    { top, left: 0, width: left, height: Math.max(0, bottom - top) },
    { top, left: right, width: Math.max(0, view.width - right), height: Math.max(0, bottom - top) },
    ...(clickable ? [] : [{ top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }]),
  ];
}

/**
 * On a phone, across the bottom of the screen. Otherwise beside the element: below it, above it, or to a side, whichever
 * fits first (the sides first when `sideFirst`).
 */
function placeCard(hole: Box | null, view: { width: number; height: number; cardHeight: number }, phone: boolean, sideFirst = false): CSSProperties {
  if (phone) return { left: EDGE, right: EDGE, bottom: EDGE };
  const width = Math.min(CARD_WIDTH, view.width - 2 * EDGE);
  const height = view.cardHeight;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));
  if (!hole) return { width, left: (view.width - width) / 2, top: Math.max(EDGE, (view.height - height) / 2) };
  const centredLeft = clamp(hole.left + hole.width / 2 - width / 2, EDGE, view.width - EDGE - width);
  const besideTop = clamp(hole.top, EDGE, view.height - EDGE - height);
  const below = hole.top + hole.height + GAP + height <= view.height - EDGE ? { width, left: centredLeft, top: hole.top + hole.height + GAP } : null;
  const above = hole.top - GAP - height >= EDGE ? { width, left: centredLeft, top: hole.top - GAP - height } : null;
  const right = hole.left + hole.width + GAP + width <= view.width - EDGE ? { width, left: hole.left + hole.width + GAP, top: besideTop } : null;
  const left = hole.left - GAP - width >= EDGE ? { width, left: hole.left - GAP - width, top: besideTop } : null;
  const fits = (sideFirst ? [right, left, below, above] : [below, above, right, left]).find(Boolean);
  if (fits) return fits;
  // Nowhere beside it (the whole Board, on a small window): over its bottom edge.
  return { width, left: centredLeft, top: view.height - EDGE - height };
}

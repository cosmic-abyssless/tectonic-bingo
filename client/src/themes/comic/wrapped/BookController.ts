import { animate } from "motion/react";
import type { WrappedProgressStore, WrappedSceneInfo } from "../../../core/wrapped/sceneProgress";
import {
  cameraTransform,
  frameArea,
  mixCamera,
  panCurve,
  panelCamera,
  pullCurve,
  sameCamera,
  stageMode,
  whipCurve,
  WRAPPED_PAGE_MIN_HEIGHT,
  WRAPPED_PAGE_WIDTH,
  type Camera,
  type Insets,
  type Rect,
  type Size,
  type StageMode,
} from "./camera";
import { deskGroups, deskLayout, type DeskGroup } from "./deskLayout";
import { panelFrames, quadClipPath, quadCuts, quadPoints, quadWithin, rectQuad } from "./frames";
import { buildPages, CONTENTS_SECTION, isAfter, nextStop, pageStart, prevStop, PULL, reachedAfter, sameStop, sectionIds, sectionStart, withGroups, type GuidePage, type Stop } from "./guide";

// The comic Wrapped's book, run: the pages laid out on the desk (a spread at a time on a wide screen, a page at a time on
// a phone, each group at its own slight angle), each panel's slanted frame, which page and panel the reader is on, the
// camera that frames it, and what each Scene is told (how many of its panels are reached). Imperative on purpose, like
// the Tile book's: the camera's moves are written straight to the DOM every frame, with the React tree only reading the
// result (BookSnapshot) for what it draws around them.
//
// The camera's moves (camera.ts has their curves):
//  - a whip from panel to panel on a spread, or a hard cut with an impact (a flash and a shake) onto the first panel of a
//    spread worth one (a splash, a highlight), the first time it is reached;
//  - a pull back to the whole spread after its last panel;
//  - a pan across the desk to the next spread, a moment's hold on all of it, then in to its first panel.

const WHIP_SECONDS = 0.5;
const PULL_SECONDS = 0.8;
const PAN_SECONDS = 0.65;
/** How long the camera holds on a spread it has panned to before it goes in on the first panel (ms). */
const PAN_HOLD_MS = 260;
/** The room (px, desk coordinates) the pull-back leaves around a spread: on a wide screen, the side images beside it. */
const PULL_PAD: Record<StageMode, number> = { wide: 70, phone: 16 };
/** The paper a narration inset is cut out with, round it (px). */
const INSET_HALO = 7;

export interface BookSnapshot {
  /** The Scenes have registered and the book is laid out. */
  ready: boolean;
  pages: readonly GuidePage[];
  /** Where the reader is, or is going. */
  pos: Stop;
  mode: StageMode;
  /** The groups on the desk: where each lies, for what is drawn beside them (the side images). */
  groups: readonly DeskGroup[];
}

/** What the camera's moves draw over the stage. */
export interface CameraEffects {
  /** The hard cut's impact: a flash and a shake. */
  impact(): void;
}

export interface BookEnv {
  stage: HTMLElement;
  world: HTMLElement;
  store: WrappedProgressStore;
  /** The model's section labels (WrappedSectionKind → "Your Team"). */
  labels: Readonly<Record<string, string>>;
  reduceMotion: () => boolean;
  insets: (mode: StageMode) => Insets;
  effects: CameraEffects;
  /** Where the anchor in the URL starts the book: one of the book's sections (given), or null. */
  startSection: (sections: string[]) => string | null;
  /** The reader has moved to a stop (the URL anchor follows the section). */
  onStop: (stop: Stop, page: GuidePage) => void;
  /** The reader has arrived at the back cover. */
  onBackCover: () => void;
}

interface Tween {
  done: Promise<boolean>;
  cancel(): void;
}

function tween(seconds: number, onUpdate: (t: number) => void): Tween {
  let resolve!: (completed: boolean) => void;
  const done = new Promise<boolean>((r) => (resolve = r));
  const controls = animate(0, 1, { duration: seconds, ease: "linear", onUpdate, onComplete: () => resolve(true) });
  return {
    done,
    cancel() {
      controls.stop();
      resolve(false);
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An element's box in the coordinates of an ancestor, from layout alone (so neither the camera nor a tilt counts). */
export function offsetRectWithin(el: HTMLElement, ancestor: HTMLElement): Rect {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
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

const PANEL_SELECTOR = ".wrapped-panel[data-wrapped-step]";
const stopKey = (s: Stop) => `${s.page}:${s.step}`;

export class BookController {
  private env: BookEnv | null = null;
  private listeners = new Set<() => void>();
  private snap: BookSnapshot = { ready: false, pages: [], pos: { page: 0, step: 0 }, mode: "wide", groups: [] };
  private scenes: WrappedSceneInfo[] = [];
  private pageEls: HTMLElement[] = [];
  /** The pages as the Scenes give them, before they are grouped for the desk (which depends on the stage's width). */
  private basePages: GuidePage[] = [];
  /** Each page's x in its group (px). */
  private pageX: number[] = [];
  /** The stops the camera cuts to with an impact: the first splash or highlight of each group. */
  private impacts = new Set<string>();
  private reached: number[] = [];
  private camera: Camera = { scale: 1, x: 0, y: 0, angle: 0 };
  private camTween: Tween | null = null;
  private token = 0;
  private signature = "";
  private backReported = false;
  private relayoutAfter = false;
  private observer: ResizeObserver | null = null;
  private laidOut = "";

  // ---- external store ---------------------------------------------------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getSnapshot = () => this.snap;
  private set(patch: Partial<BookSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---- wiring -----------------------------------------------------------------------------------------------------

  attach(env: BookEnv) {
    this.env = env;
    this.set({ mode: stageMode(env.stage.clientWidth) });
  }

  detach() {
    this.token++;
    this.camTween?.cancel();
    this.observer?.disconnect();
    this.observer = null;
    this.env = null;
  }

  /** The Scenes now registered with the store (in document order): lays out the book once they're all there. */
  setScenes(scenes: readonly WrappedSceneInfo[]) {
    const env = this.env;
    if (!env) return;
    if (scenes.length === 0 || scenes.some((s) => !s.element)) return;
    const sceneList = [...scenes];
    const guide = sceneList.map((s) => ({
      id: s.id,
      steps: s.steps,
      // The Reveal steps the Scene has a Reveal at: a section may leave a step out, and there's nothing to go to there.
      panels: [...s.element!.querySelectorAll<HTMLElement>("[data-wrapped-step]")].map((el) => Number(el.dataset.wrappedStep)),
      sectionId: s.element!.closest("[data-wrapped-section]")?.getAttribute("data-wrapped-section") ?? "page",
      credits: s.element!.classList.contains("wrapped-credits"),
    }));
    const signature = guide.map((g) => `${g.id}:${g.steps}:${g.panels.join(",")}:${g.sectionId}`).join("|");
    if (signature === this.signature) return;
    const first = !this.signature;
    this.signature = signature;
    this.scenes = sceneList;
    this.pageEls = sceneList.map((s) => s.element!);
    this.basePages = buildPages(guide, env.labels);
    // What a page is, for the CSS that dresses it (covers have no margin to print a footer in).
    this.pageEls.forEach((el, i) => {
      el.dataset.pageKind = this.basePages[i]!.kind;
      el.dataset.pageNo = this.basePages[i]!.no === null ? "" : String(this.basePages[i]!.no);
    });
    // A page's content changing size (an image arriving, the lettering font loading) lays the book out again.
    this.observer?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.relayout());
      this.pageEls.forEach((el) => this.observer!.observe(el));
    }
    this.reached = this.basePages.map((_, i) => this.reached[i] ?? 0);
    this.laidOut = "";
    this.layout();
    if (first) this.start();
    else this.relayout();
  }

  /** The stage changed size (or a page's content did): lay the book out again and frame the current stop, without moving. */
  relayout() {
    const env = this.env;
    if (!env || !this.snap.ready) return;
    // A move in progress carries on to where it was going; the book is laid out again as it lands.
    if (this.camTween) {
      this.relayoutAfter = true;
      return;
    }
    this.layout();
    this.applyCamera(this.cameraAt(this.snap.pos));
    this.markCurrent(this.snap.pos);
  }

  // ---- reading ----------------------------------------------------------------------------------------------------

  next() {
    const to = nextStop(this.snap.pages, this.snap.pos);
    if (to) void this.go(to);
  }
  prev() {
    const to = prevStop(this.snap.pages, this.snap.pos);
    if (to) void this.go(to);
  }
  /** Jump to a section's first panel (the contents page, "Skip to the end"). */
  goToSection(sectionId: string) {
    const to = sectionStart(this.snap.pages, sectionId);
    if (to) void this.go(to);
  }
  goToContents() {
    this.goToSection(CONTENTS_SECTION);
  }

  /** Move to a stop: a whip (or an impact) to a panel of the spread, a pull back to it, or a pan across to another. */
  async go(to: Stop): Promise<void> {
    const env = this.env;
    if (!env || !this.snap.ready) return;
    const from = this.snap.pos;
    if (sameStop(from, to)) return;
    const token = ++this.token;
    this.camTween?.cancel();
    this.camTween = null;
    this.stopped(to);
    // The panel is drawn in as the camera sets off, not when it lands: snappier, and a reader moving on before it lands
    // still sees every panel they pass drawn.
    this.reach(to);
    const target = this.cameraAt(to);

    if (env.reduceMotion()) {
      this.applyCamera(target);
      this.arrive(to);
      return;
    }

    const pages = this.snap.pages;
    const forward = isAfter(to, from);
    // An impact only the first time a panel is reached, going forward: back over it, it is just a panel.
    const impact = forward && to.step !== PULL && this.impacts.has(stopKey(to)) && (this.reached[to.page] ?? 0) <= to.step;
    const otherGroup = pages[to.page]!.group !== pages[from.page]!.group;

    if (otherGroup) {
      const overview = this.groupCamera(pages[to.page]!.group);
      // Panned to a spread, the camera holds on all of it, then goes in; a cover (all of it is the panel) needs no going in.
      const goIn = !sameCamera(overview, target);
      if (!(await this.move(goIn ? overview : target, PAN_SECONDS, panCurve, token))) return;
      if (goIn) {
        await wait(PAN_HOLD_MS);
        if (token !== this.token) return;
        if (impact) this.cut(target);
        else if (!(await this.move(target, WHIP_SECONDS, whipCurve, token))) return;
      }
    } else if (to.step === PULL) {
      if (!(await this.move(target, PULL_SECONDS, pullCurve, token))) return;
    } else if (impact) {
      this.cut(target);
    } else if (!(await this.move(target, WHIP_SECONDS, whipCurve, token))) return;

    if (token === this.token) this.arrive(to);
  }

  /** The reader is going to a stop: its panel is drawn in. */
  private reach(to: Stop) {
    if (!this.env) return;
    this.reached = reachedAfter(this.reached, to).slice(0, this.snap.pages.length);
    this.pushSceneStates(to);
  }

  /** The camera has landed on a stop: the back cover is reported. */
  private arrive(to: Stop) {
    const env = this.env;
    if (!env) return;
    const page = this.snap.pages[to.page];
    if (page?.kind === "back" && !this.backReported) {
      this.backReported = true;
      env.onBackCover();
    }
  }

  /** The position has changed (before it is reached): the HUD and the URL follow at once. */
  private stopped(to: Stop) {
    this.set({ pos: to });
    this.markCurrent(to);
    const page = this.snap.pages[to.page];
    if (page) this.env?.onStop(to, page);
  }

  /** Only the spread being read can be reached with the keyboard (the contents page's links, the share cards' buttons). */
  private markCurrent(at: Stop) {
    const group = this.snap.pages[at.page]?.group;
    this.pageEls.forEach((el, i) => {
      el.inert = this.snap.pages[i]?.group !== group;
    });
  }

  // ---- start ------------------------------------------------------------------------------------------------------

  private start() {
    const env = this.env!;
    const pages = this.snap.pages;
    const section = env.startSection(sectionIds(pages));
    const at = (section && sectionStart(pages, section)) || pageStart(pages, 0) || { page: 0, step: 0 };
    this.token++;
    // The panels start unreached (empty frames), except with reduced motion, where they all appear filled.
    if (env.reduceMotion()) this.reached = pages.map((p) => (p.panels[p.panels.length - 1] ?? 0) + 1);
    this.applyCamera(this.cameraAt(at));
    this.set({ ready: true, pos: at });
    this.markCurrent(at);
    const page = pages[at.page];
    if (page) env.onStop(at, page);
    this.pushSceneStates(at);
    // One frame on, so the first panel is drawn in as the book opens rather than being there at the first paint.
    const open = () => {
      this.reach(at);
      this.arrive(at);
    };
    if (env.reduceMotion()) open();
    else requestAnimationFrame(() => (this.env === env ? open() : undefined));
  }

  // ---- layout -----------------------------------------------------------------------------------------------------

  /**
   * Lays the pages out on the desk, a group at a time, each page as tall as the tallest of its group, and draws every
   * panel's frame. Only writes what changed, so the page's own resize observer settles after one pass.
   */
  private layout() {
    const env = this.env;
    if (!env || !this.pageEls.length) return;
    const mode = stageMode(env.stage.clientWidth);
    const groups = deskGroups(
      this.basePages.map((p) => p.kind),
      mode,
    );
    // Each page's own height: measured without the height its group gave it, all at once (one layout, not one a page).
    this.pageEls.forEach((el) => (el.style.minHeight = ""));
    const heights = this.pageEls.map((el) => Math.max(WRAPPED_PAGE_MIN_HEIGHT, el.offsetHeight));
    const desk = deskLayout(groups, heights, mode);
    this.pageX = [];
    desk.forEach((g) =>
      g.pages.forEach((i, n) => {
        const el = this.pageEls[i]!;
        const x = n * WRAPPED_PAGE_WIDTH;
        this.pageX[i] = x;
        el.style.minHeight = `${g.h}px`;
        const transform = `translate(${g.place.x}px, ${g.place.y}px) rotate(${g.place.angle}deg) translate(${x}px, 0px)`;
        if (el.style.transform !== transform) el.style.transform = transform;
        el.dataset.spread = g.pages.length === 1 ? "single" : n === 0 ? "left" : "right";
      }),
    );
    this.pageEls.forEach((el) => this.drawFrames(el));

    const signature = `${mode}|${groups.map((g) => g.join(",")).join("/")}`;
    const pages = signature === this.laidOut ? this.snap.pages : withGroups(this.basePages, groups);
    this.laidOut = signature;
    this.impacts = this.findImpacts(pages);
    this.set({ pages, mode, groups: desk });
  }

  /** Each panel's frame on a page: the slanted quad it is clipped to and its ink and pencil lines drawn along. */
  private drawFrames(pageEl: HTMLElement) {
    const panels = [...pageEl.querySelectorAll<HTMLElement>(PANEL_SELECTOR)].filter((el) => el.dataset.bare !== "true" && el.offsetWidth > 0);
    const rects = panels.map((el) => offsetRectWithin(el, pageEl));
    const straight = panels.map((el) => el.dataset.emphasis === "narration");
    const quads = panelFrames(
      rects.map((rect, i) => ({ rect, straight: straight[i] })),
      WRAPPED_PAGE_WIDTH,
    );
    panels.forEach((el, i) => {
      const own = quadWithin(quads[i]!, rects[i]!);
      // An inset is cut out with a little paper round it, so it stands off the panel it sits on.
      const clip = quadClipPath(straight[i] ? rectQuad({ x: 0, y: 0, w: rects[i]!.w, h: rects[i]!.h }, INSET_HALO) : own);
      if (el.style.clipPath !== clip) el.style.clipPath = clip;
      // How far the slant cuts into each side, for the content to keep clear of (comic.css).
      const cuts = quadCuts(own, rects[i]!.w, rects[i]!.h);
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const value = `${Math.round(cuts[side])}px`;
        if (el.style.getPropertyValue(`--panel-cut-${side}`) !== value) el.style.setProperty(`--panel-cut-${side}`, value);
      }
      const points = quadPoints(own);
      el.querySelectorAll<SVGPolygonElement>(":scope > .wrapped-panel-frame polygon").forEach((p) => {
        if (p.getAttribute("points") !== points) p.setAttribute("points", points);
      });
    });
  }

  /** The stops worth an impact: in each group, the first panel marked a splash or a highlight. */
  private findImpacts(pages: readonly GuidePage[]): Set<string> {
    const out = new Set<string>();
    const seen = new Set<number>();
    pages.forEach((page, i) => {
      if (seen.has(page.group)) return;
      const el = this.pageEls[i];
      const marked = el ? [...el.querySelectorAll<HTMLElement>(`${PANEL_SELECTOR}[data-emphasis="splash"], ${PANEL_SELECTOR}[data-emphasis="highlight"]`)] : [];
      const step = marked.map((p) => Number(p.dataset.wrappedStep)).sort((a, b) => a - b)[0];
      if (step === undefined) return;
      seen.add(page.group);
      out.add(stopKey({ page: i, step }));
    });
    return out;
  }

  private stageSize(): Size {
    const stage = this.env!.stage;
    return { w: stage.clientWidth, h: stage.clientHeight };
  }

  private insets(): Insets {
    return this.env!.insets(stageMode(this.stageSize().w));
  }

  /** The camera on a whole group, square to the screen. */
  private groupCamera(group: number): Camera {
    const g = this.snap.groups[group];
    if (!g) return this.camera;
    const pad = PULL_PAD[this.snap.mode];
    return frameArea(this.stageSize(), this.insets(), g.place, { x: -pad, y: -pad, w: g.w + 2 * pad, h: g.h + 2 * pad });
  }

  /** The camera that frames a stop: its panel, or the whole spread for the pull-back. */
  private cameraAt(at: Stop): Camera {
    const page = this.snap.pages[at.page];
    if (!page) return this.camera;
    if (at.step === PULL) return this.groupCamera(page.group);
    const g = this.snap.groups[page.group];
    const el = this.pageEls[at.page];
    if (!g || !el) return this.camera;
    const x = this.pageX[at.page] ?? 0;
    const rect = this.panelRect(el, at.step) ?? { x: 0, y: 0, w: WRAPPED_PAGE_WIDTH, h: g.h };
    return panelCamera(this.stageSize(), this.insets(), g.place, { x: x + rect.x, y: rect.y, w: rect.w, h: rect.h });
  }

  /** The panel of a step: all of the page's Reveals at that step, together. */
  private panelRect(pageEl: HTMLElement, step: number): Rect | null {
    const panels = [...pageEl.querySelectorAll<HTMLElement>(`[data-wrapped-step="${step}"]`)];
    return unionRect(panels.filter((p) => p.offsetWidth > 0).map((p) => offsetRectWithin(p, pageEl)));
  }

  private applyCamera(camera: Camera) {
    this.camera = camera;
    this.env!.world.style.transform = cameraTransform(camera);
  }

  /** A hard cut to a panel, with the impact's flash and shake. */
  private cut(to: Camera) {
    this.applyCamera(to);
    this.env!.effects.impact();
  }

  /** Moves the camera along a curve (camera.ts); false if it was overtaken by another move. */
  private async move(to: Camera, seconds: number, curve: (t: number) => number, token: number): Promise<boolean> {
    this.camTween?.cancel();
    const from = this.camera;
    if (sameCamera(from, to)) {
      this.applyCamera(to);
      return token === this.token;
    }
    const move = tween(seconds, (t) => this.applyCamera(mixCamera(from, to, curve(t))));
    this.camTween = move;
    const completed = await move.done;
    if (this.camTween === move) {
      this.camTween = null;
      if (this.relayoutAfter) {
        this.relayoutAfter = false;
        this.relayout();
      }
    }
    return completed && token === this.token;
  }

  /** Tells every Scene how much of it is reached, and which is current. */
  private pushSceneStates(at: Stop) {
    const env = this.env!;
    const reduce = env.reduceMotion();
    this.scenes.forEach((scene, i) => {
      const reached = reduce ? scene.steps : Math.min(scene.steps, this.reached[i] ?? 0);
      env.store.setSceneState(scene.id, { reached, current: i === at.page });
    });
  }

  /** Whether the reader is exactly here already. */
  isAt(stop: Stop) {
    return sameStop(this.snap.pos, stop);
  }
}

import { animate } from "motion/react";
import type { WrappedProgressStore, WrappedSceneInfo } from "../../../core/wrapped/sceneProgress";
import {
  cameraTransform,
  mixCamera,
  overviewCamera,
  panelCamera,
  stageMode,
  unionRect,
  WRAPPED_PAGE_MIN_HEIGHT,
  WRAPPED_PAGE_WIDTH,
  type Camera,
  type Insets,
  type Rect,
  type Size,
  type StageMode,
} from "./camera";
import { backCoverStart, buildPages, CONTENTS_SECTION, moveKind, nextStop, pageStart, prevStop, reachedAfter, sameStop, sectionIds, sectionStart, type GuidePage, type Stop } from "./guide";
import { drawPeel, findFoldDom, peelHeldAt, type PeelStyle } from "./pageTurn";
import type { PanelFocus } from "./ComicReveal";

// The comic Wrapped's book, run: which page and panel the reader is on, the camera that frames it, the page turn, and what
// each Scene is told (how many of its panels are reached, whether it is the current page). Imperative on purpose, like the
// Tile book's: a camera glide and a page turn are animations written straight to the DOM every frame, with the React tree
// only reading the result (BookSnapshot) for what it draws around them.

/** The page turn's pace: the Tile book's (board/TileModal's TURN_DURATION, TURN_EASE, COVER_SWING). */
const TURN_SECONDS = 0.375;
const COVER_SECONDS = 0.49;
const TURN_EASE = [0.45, 0, 0.15, 1] as const;
/** The camera's moves: pulling back to the whole page, and gliding to a panel. */
const PULL_BACK_SECONDS = 0.4;
const GLIDE_SECONDS = 0.55;
const PAN_SECONDS = 0.5;
const GLIDE_EASE = [0.4, 0, 0.2, 1] as const;
/** How far through its glide the camera is "arrived" at a panel: the brush starts painting it. */
const ARRIVED_AT = 0.45;
/** Where along the edge a turn that nobody is holding is taken from (the lower corner), -1 top to 1 bottom. */
const TURN_HELD_AT = 0.6;
/** A drag turns the page if it gets this far across (of the page's width), or is let go this fast (px/ms) after this far (px). */
export const DRAG_COMMIT = 0.35;
export const DRAG_FLICK = 0.3;
export const DRAG_FLICK_MIN = 30;
/** A perspective for the cover's swing, as a multiple of the page's width. */
const COVER_PERSPECTIVE = 4.5;

export interface BookSnapshot {
  /** The Scenes have registered and the book is laid out. */
  ready: boolean;
  pages: readonly GuidePage[];
  /** Where the reader is, or is going. */
  pos: Stop;
  /** The panel that is lit: the one the camera has arrived at. */
  focus: PanelFocus;
  mode: StageMode;
  /** The height of the page being read (px, in page coordinates): the book is as tall as it. */
  bookHeight: number;
  /** The book is mid-turn (or being dragged): nothing else moves it. */
  turning: boolean;
  /** The pointer is dragging a page (the edge swipe). */
  dragging: boolean;
}

export interface BookEnv {
  stage: HTMLElement;
  world: HTMLElement;
  book: HTMLElement;
  store: WrappedProgressStore;
  /** The model's section labels (WrappedSectionKind → "Your Team"). */
  labels: Readonly<Record<string, string>>;
  reduceMotion: () => boolean;
  insets: (mode: StageMode) => Insets;
  peelStyle: () => PeelStyle;
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

function tween(seconds: number, ease: readonly [number, number, number, number] | "linear", onUpdate: (t: number) => void): Tween {
  let resolve!: (completed: boolean) => void;
  const done = new Promise<boolean>((r) => (resolve = r));
  const controls = animate(0, 1, { duration: seconds, ease: ease as never, onUpdate, onComplete: () => resolve(true) });
  return {
    done,
    cancel() {
      controls.stop();
      resolve(false);
    },
  };
}

/** An element's box in the coordinates of an ancestor, from layout alone (so neither the camera's scale nor a tilt counts). */
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

/** How a turn is drawn between two pages: `set(0)` is the first page whole, `set(1)` the second. */
interface Turner {
  set(fraction: number, v: number): void;
  end(): void;
}

export class BookController {
  private env: BookEnv | null = null;
  private listeners = new Set<() => void>();
  private snap: BookSnapshot = { ready: false, pages: [], pos: { page: 0, step: 0 }, focus: { sceneId: null, step: 0 }, mode: "wide", bookHeight: WRAPPED_PAGE_MIN_HEIGHT, turning: false, dragging: false };
  private scenes: WrappedSceneInfo[] = [];
  private pageEls: HTMLElement[] = [];
  private reached: number[] = [];
  private camera: Camera = { scale: 1, x: 0, y: 0 };
  private camTween: Tween | null = null;
  private turnTween: Tween | null = null;
  private token = 0;
  private drag: { from: Stop; to: Stop; forward: boolean; turner: Turner; v: number } | null = null;
  private signature = "";
  private backReported = false;
  private dragFraction = 0;
  private relayoutAfter = false;
  private observer: ResizeObserver | null = null;

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
    this.turnTween?.cancel();
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
    }));
    const signature = guide.map((g) => `${g.id}:${g.steps}:${g.panels.join(",")}:${g.sectionId}`).join("|");
    if (signature === this.signature) return;
    const first = !this.signature;
    this.signature = signature;
    this.scenes = sceneList;
    this.pageEls = sceneList.map((s) => s.element!);
    const pages = buildPages(guide, env.labels);
    // What a page is, for the CSS that dresses it (covers have no margin to print a footer in).
    this.pageEls.forEach((el, i) => {
      el.dataset.pageKind = pages[i]!.kind;
      el.dataset.pageNo = pages[i]!.no === null ? "" : String(pages[i]!.no);
    });
    // A page's content changing size (an image arriving, the lettering font loading) re-frames the book.
    this.observer?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.relayout());
      this.pageEls.forEach((el) => this.observer!.observe(el));
    }
    this.reached = pages.map((_, i) => this.reached[i] ?? 0);
    this.set({ pages });
    if (first) this.start();
    else this.relayout();
  }

  /** The stage changed size (or a page's content did): frame the current panel again, without moving. */
  relayout() {
    const env = this.env;
    if (!env || !this.snap.ready) return;
    const mode = stageMode(env.stage.clientWidth);
    if (mode !== this.snap.mode) this.set({ mode });
    if (this.snap.turning || this.drag) return;
    // A glide in progress carries on to where it was going; the book is framed again as it lands.
    if (this.camTween) {
      this.relayoutAfter = true;
      return;
    }
    this.layoutBook(this.snap.pos.page);
    this.applyCamera(this.cameraAt(this.snap.pos));
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
  /** Jump to a section's first panel (the contents page, "Skip to the back cover"). */
  goToSection(sectionId: string) {
    const to = sectionStart(this.snap.pages, sectionId);
    if (to) void this.go(to);
  }
  goToBackCover() {
    const to = backCoverStart(this.snap.pages);
    if (to) void this.go(to);
  }
  goToContents() {
    this.goToSection(CONTENTS_SECTION);
  }

  /** Move to a stop: a glide to another panel of the page, or a turn (with the camera pulling back first and going in after). */
  async go(to: Stop): Promise<void> {
    const env = this.env;
    if (!env || !this.snap.ready || this.snap.turning) return;
    const from = this.snap.pos;
    const kind = moveKind(from, to);
    if (kind === "none") return;
    const token = ++this.token;
    this.camTween?.cancel();
    this.camTween = null;
    this.stopped(to);

    if (env.reduceMotion()) {
      this.layoutBook(to.page);
      this.showPages([to.page]);
      this.applyOpenState(to.page);
      this.applyCamera(this.cameraAt(to));
      this.arrive(to);
      return;
    }

    if (kind === "panel") {
      await this.glide(to, PAN_SECONDS, token);
      return;
    }

    const forward = kind === "turn-forward";
    this.set({ turning: true });
    const hMax = Math.max(this.pageHeight(from.page), this.pageHeight(to.page));
    this.layoutBook(Math.max(from.page, to.page), hMax);
    // 1. Pull back to the whole page.
    const overview = this.overview(hMax);
    if (!(await this.moveCamera(overview, PULL_BACK_SECONDS, token))) return this.abandon();
    // 2. Turn it.
    this.showPages(forward ? [from.page, to.page] : [to.page, from.page]);
    const turner = this.turnerFor(from.page, to.page, forward);
    const swings = this.isSwing(from.page, to.page);
    const turn = tween(swings ? COVER_SECONDS : TURN_SECONDS, TURN_EASE, (t) => turner.set(t, TURN_HELD_AT));
    this.turnTween = turn;
    const turned = await turn.done;
    this.turnTween = null;
    turner.end();
    if (!turned || token !== this.token) return this.abandon();
    this.showPages([to.page]);
    this.applyOpenState(to.page);
    this.layoutBook(to.page);
    this.set({ turning: false });
    // 3. Go in on the first panel.
    await this.glide(to, GLIDE_SECONDS, token);
  }

  private abandon() {
    this.set({ turning: false });
  }

  /** Glide the camera to a stop's panel; the panel is painted in once the camera has mostly arrived. */
  private async glide(to: Stop, seconds: number, token: number) {
    this.layoutBook(to.page);
    const target = this.cameraAt(to);
    let arrived = false;
    const done = await this.moveCamera(target, seconds, token, (t) => {
      if (!arrived && t >= ARRIVED_AT) {
        arrived = true;
        this.arrive(to);
      }
    });
    if (done && !arrived) this.arrive(to);
  }

  /** The reader has reached a stop's panel: it is lit, painted in, and (the back cover) reported. */
  private arrive(to: Stop) {
    const env = this.env;
    if (!env) return;
    this.reached = reachedAfter(this.reached, to).slice(0, this.snap.pages.length);
    this.pushSceneStates(to);
    const page = this.snap.pages[to.page];
    this.set({ focus: { sceneId: page?.sceneId ?? null, step: to.step } });
    if (page?.kind === "back" && !this.backReported) {
      this.backReported = true;
      env.onBackCover();
    }
  }

  /** The position has changed (before it is reached): the HUD and the URL follow at once. */
  private stopped(to: Stop) {
    this.set({ pos: to });
    const page = this.snap.pages[to.page];
    if (page) this.env?.onStop(to, page);
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
    this.layoutBook(at.page);
    this.showPages([at.page]);
    this.applyOpenState(at.page);
    this.applyCamera(this.cameraAt(at));
    this.set({ ready: true, pos: at });
    const page = pages[at.page];
    if (page) env.onStop(at, page);
    this.pushSceneStates(at);
    // One frame on, so the first panel is painted in as the book opens rather than being there at the first paint.
    if (env.reduceMotion()) this.arrive(at);
    else requestAnimationFrame(() => (this.env === env ? this.arrive(at) : undefined));
  }

  // ---- layout -----------------------------------------------------------------------------------------------------

  private pageHeight(i: number): number {
    const el = this.pageEls[i];
    return Math.max(WRAPPED_PAGE_MIN_HEIGHT, el?.offsetHeight ?? 0);
  }

  /** The book is as tall as the page being read (or `height`, mid-turn). */
  private layoutBook(page: number, height?: number) {
    const env = this.env;
    if (!env) return;
    const h = height ?? this.pageHeight(page);
    env.book.style.height = `${h}px`;
    if (h !== this.snap.bookHeight) this.set({ bookHeight: h });
  }

  private stageSize(): Size {
    const stage = this.env!.stage;
    return { w: stage.clientWidth, h: stage.clientHeight };
  }

  private overview(height: number): Camera {
    const mode = stageMode(this.stageSize().w);
    return overviewCamera(this.stageSize(), { w: WRAPPED_PAGE_WIDTH, h: height }, this.env!.insets(mode));
  }

  /** The camera that frames a stop: its panel on a phone, the whole page nudged toward it on a wide screen. */
  private cameraAt(at: Stop): Camera {
    const env = this.env!;
    const el = this.pageEls[at.page];
    const h = this.pageHeight(at.page);
    const page = { w: WRAPPED_PAGE_WIDTH, h };
    const mode = stageMode(this.stageSize().w);
    const insets = env.insets(mode);
    const stage = this.stageSize();
    const rect = el ? this.panelRect(el, at.step) : null;
    return panelCamera({ stage, page, panel: rect ?? { x: 0, y: 0, w: page.w, h: page.h }, mode, insets });
  }

  /** The panel of a step: all of the page's Reveals at that step, together (the whole page when it has none). */
  private panelRect(pageEl: HTMLElement, step: number): Rect | null {
    const panels = [...pageEl.querySelectorAll<HTMLElement>(`[data-wrapped-step="${step}"]`)];
    // A cover is one panel that is the whole page.
    const rects = panels.filter((p) => p.offsetWidth > 0).map((p) => offsetRectWithin(p, pageEl));
    return unionRect(rects);
  }

  private applyCamera(camera: Camera) {
    this.camera = camera;
    this.env!.world.style.transform = cameraTransform(camera);
  }

  private async moveCamera(to: Camera, seconds: number, token: number, onProgress?: (t: number) => void): Promise<boolean> {
    this.camTween?.cancel();
    const from = this.camera;
    const near = Math.abs(from.scale - to.scale) < 0.004 && Math.abs(from.x - to.x) < 1.5 && Math.abs(from.y - to.y) < 1.5;
    if (near) {
      this.applyCamera(to);
      onProgress?.(1);
      return token === this.token;
    }
    const move = tween(seconds, GLIDE_EASE, (t) => {
      this.applyCamera(mixCamera(from, to, t));
      onProgress?.(t);
    });
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

  // ---- pages ------------------------------------------------------------------------------------------------------

  /** Only these pages are seen (and can be reached with the keyboard); `[turning page, page beneath]` while one turns. */
  private showPages(visible: number[]) {
    this.pageEls.forEach((el, i) => {
      const shown = visible.includes(i);
      el.style.visibility = shown ? "visible" : "hidden";
      el.inert = !shown;
      el.style.zIndex = shown ? String(visible.length - visible.indexOf(i)) : "0";
    });
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

  private hinge(): HTMLElement | null {
    return this.env?.book.querySelector<HTMLElement>("[data-cover-hinge]") ?? null;
  }

  /** The cover lies open on the left once the reader is past it, and shut over the first page while they're on it. */
  private applyOpenState(page: number) {
    const hinge = this.hinge();
    if (!hinge) return;
    hinge.style.transform = `rotateY(${page > 0 ? -180 : 0}deg)`;
    // Open, the cover fades away: what lies beside the page is the desk's (its stickers), and a phone has no desk.
    hinge.style.opacity = page > 0 ? "0" : "1";
    hinge.style.pointerEvents = page > 0 ? "none" : "";
  }

  private isSwing(a: number, b: number) {
    const pages = this.snap.pages;
    return pages[a]?.kind === "cover" || pages[b]?.kind === "cover";
  }

  /** How a turn between two pages is drawn: the cover swings on its hinge, any other page is peeled off the one beneath. */
  private turnerFor(fromPage: number, toPage: number, forward: boolean): Turner {
    const env = this.env!;
    if (this.isSwing(fromPage, toPage)) {
      const hinge = this.hinge();
      const book = env.book;
      book.style.perspective = `${WRAPPED_PAGE_WIDTH * COVER_PERSPECTIVE}px`;
      book.style.perspectiveOrigin = "50% 50%";
      // A cover that had faded away is back at once for its swing.
      if (hinge) {
        hinge.style.transition = "none";
        hinge.style.opacity = "1";
        void hinge.offsetWidth;
        hinge.style.transition = "";
      }
      return {
        set: (f) => {
          if (hinge) hinge.style.transform = `rotateY(${(forward ? -180 * f : -180 * (1 - f)).toFixed(2)}deg)`;
        },
        end: () => {
          book.style.perspective = "";
          book.style.perspectiveOrigin = "";
        },
      };
    }
    const top = this.pageEls[forward ? fromPage : toPage]!;
    const dom = findFoldDom(env.book);
    const W = WRAPPED_PAGE_WIDTH;
    const H = parseFloat(env.book.style.height) || this.pageHeight(fromPage);
    return {
      set: (f, v) => {
        if (!dom) return;
        const fraction = forward ? f : 1 - f;
        drawPeel(dom, top, W, H, { fraction, v: v * (1 - fraction) }, env.peelStyle());
      },
      end: () => {
        if (dom) drawPeel(dom, top, W, H, null, env.peelStyle());
      },
    };
  }

  // ---- the edge swipe ---------------------------------------------------------------------------------------------

  /** Whether a page can be taken by its edge now: the book is at rest, and there is a page that way. */
  canDrag(forward: boolean): boolean {
    const env = this.env;
    if (!env || !this.snap.ready || this.snap.turning || env.reduceMotion()) return false;
    return !!pageStart(this.snap.pages, this.snap.pos.page + (forward ? 1 : -1));
  }

  /** A finger has started dragging a page's edge: pull back and let the page follow it. False when the book can't be turned now. */
  beginDrag(forward: boolean): boolean {
    if (!this.canDrag(forward)) return false;
    const from = this.snap.pos;
    const toPage = from.page + (forward ? 1 : -1);
    const to = pageStart(this.snap.pages, toPage)!;
    this.token++;
    this.camTween?.cancel();
    this.camTween = null;
    const hMax = Math.max(this.pageHeight(from.page), this.pageHeight(toPage));
    this.layoutBook(Math.max(from.page, toPage), hMax);
    this.showPages(forward ? [from.page, toPage] : [toPage, from.page]);
    const turner = this.turnerFor(from.page, toPage, forward);
    this.drag = { from, to, forward, turner, v: 0 };
    this.set({ turning: true, dragging: true });
    const overview = this.overview(hMax);
    const start = this.camera;
    this.camTween = tween(0.3, GLIDE_EASE, (t) => this.applyCamera(mixCamera(start, overview, t)));
    return true;
  }

  /** The finger has travelled `travel` px (screen) across, at `clientY` on the screen. */
  dragTo(travel: number, clientY: number) {
    const d = this.drag;
    const env = this.env;
    if (!d || !env) return;
    const W = WRAPPED_PAGE_WIDTH;
    const fraction = Math.max(0, Math.min(1, travel / this.camera.scale / (2 * W)));
    const rect = env.book.getBoundingClientRect();
    d.v = peelHeldAt(clientY, rect.top, rect.height);
    d.turner.set(fraction, d.v);
    this.dragFraction = fraction;
  }

  /** The finger has lifted: the page goes on over, or settles back. */
  async endDrag({ travel, velocity, cancelled }: { travel: number; velocity: number; cancelled: boolean }) {
    const d = this.drag;
    const env = this.env;
    if (!d || !env) return;
    const W = WRAPPED_PAGE_WIDTH;
    const pageTravel = travel / this.camera.scale;
    const commit = !cancelled && (pageTravel >= W * DRAG_COMMIT || (velocity >= DRAG_FLICK && travel >= DRAG_FLICK_MIN));
    const from = this.dragFraction;
    const token = this.token;
    this.drag = null;
    this.set({ dragging: false });
    const target = commit ? 1 : 0;
    const settle = tween(Math.max(0.12, (commit ? 1 - from : from) * TURN_SECONDS), TURN_EASE, (t) => d.turner.set(from + (target - from) * t, d.v));
    this.turnTween = settle;
    await settle.done;
    this.turnTween = null;
    d.turner.end();
    if (token !== this.token) return this.abandon();
    if (commit) {
      this.stopped(d.to);
      this.showPages([d.to.page]);
      this.applyOpenState(d.to.page);
      this.layoutBook(d.to.page);
      this.set({ turning: false });
      await this.glide(d.to, GLIDE_SECONDS, token);
    } else {
      this.showPages([d.from.page]);
      this.applyOpenState(d.from.page);
      this.layoutBook(d.from.page);
      this.set({ turning: false });
      await this.glide(d.from, GLIDE_SECONDS, token);
    }
    this.dragFraction = 0;
  }

  /** Whether the reader is exactly here already. */
  isAt(stop: Stop) {
    return sameStop(this.snap.pos, stop);
  }
}

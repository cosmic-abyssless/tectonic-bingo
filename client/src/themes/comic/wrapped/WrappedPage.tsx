import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "motion/react";
import { useBingoHeader, useBingoMenuEntries, useWrappedModel } from "../../../headless";
import type { WrappedSectionModel } from "../../../headless/types";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Badge } from "../../../core/ui/Card";
import { ArrowRightIcon } from "../../../core/ui/icons";
import { createWrappedProgressStore, useWrappedScenes, WrappedProgressProvider } from "../../../core/wrapped/sceneProgress";
import { useSlot } from "../../context";
import { getColors } from "../board/colors";
import { PageFooter } from "../board/PageFooter";
import { ComicPage } from "../fx/ComicPage";
import { sfx } from "../fx/SfxLayer";
import { comicHeaderProps } from "../page/headerStyle";
import { ModPanelLink } from "../page/Masthead";
import { ComicButton } from "../ui/ComicButton";
import { comicVars, PageColorsContext, useComic } from "../ui/useComic";
import { BookController, type BookEnv, type CameraEffects } from "./BookController";
import { BookContext, pageTokenVars } from "./bookContext";
import { CameraFx, DeskStickers } from "./Desk";
import { ComicReveal } from "./ComicReveal";
import { ContentsPage } from "./ContentsPage";
import { INTERACTIVE_SELECTOR, isTap, keyNav, swipeNav, tapNav, WheelGesture, wheelPixels, type Nav } from "./controls";
import { CONTENTS_SECTION, nextStop, prevStop, sectionIds, sectionOfAnchor } from "./guide";
import { Hud, announcement } from "./Hud";
import { stageMode, WRAPPED_PAGE_WIDTH, type Insets, type Size, type StageMode } from "./camera";

/** The room the HUD and the edges leave around what the camera frames in the stage. */
const INSETS: Record<StageMode, Insets> = {
  phone: { top: 8, right: 8, bottom: 62, left: 8 },
  wide: { top: 14, right: 24, bottom: 76, left: 24 },
};

/** The book is printed paper, the same in the light scheme and the dark: only the desk it lies on follows the scheme. */
const PRINT = getColors("light");
const DESK: Record<"light" | "dark", CSSProperties> = {
  light: { ["--wrapped-desk" as string]: "#9fb3b8", ["--wrapped-desk-deep" as string]: "#86999f", ["--wrapped-desk-dot" as string]: "rgb(11 11 13 / 0.16)" },
  dark: { ["--wrapped-desk" as string]: "#1c1b22", ["--wrapped-desk-deep" as string]: "#111015", ["--wrapped-desk-dot" as string]: "rgb(255 255 255 / 0.05)" },
};

/** Keeps the URL's anchor on the section being read, replacing the history entry rather than adding to it. */
function replaceAnchor(sectionId: string) {
  try {
    const hash = `#${sectionId}`;
    if (window.location.hash === hash) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
  } catch {
    // A browser that won't let the page rewrite its URL just doesn't follow the section.
  }
}

/**
 * Wrapped as a comic book, read in a guided view (#419): the Intro is the front cover, an "In this issue" page follows,
 * each section is a page or two of panels, and the Outro is the back cover. The pages lie on a desk, a spread at a time
 * on a wide screen and a page at a time on a phone, and the camera flies from panel to panel, filling the screen with
 * each, pulls back to show the whole spread at its end, then pans across the desk to the next. Nothing scrolls: the
 * sections are the ordinary Wrapped sections (WrappedScene and Reveal), told by this page how far they are reached
 * (core/wrapped/sceneProgress), and drawn as panels.
 */
export function WrappedPage() {
  const wrapped = useWrappedModel();
  const header = useBingoHeader(wrapped.slug);
  const menuEntries = useBingoMenuEntries(wrapped.slug, header);
  const store = useMemo(() => createWrappedProgressStore(), []);
  const controller = useMemo(() => new BookController(), []);
  const [snap, setSnap] = useState(controller.getSnapshot);
  useEffect(() => controller.subscribe(() => setSnap(controller.getSnapshot())), [controller]);
  const scenes = useWrappedScenes(store);
  const reduceMotion = !!useReducedMotion();
  const { scheme } = useComic();
  const page = PRINT;

  // What the controller reads while it runs, kept current without re-attaching it.
  const live = useRef({ reduceMotion, actions: wrapped.actions });
  live.current = { reduceMotion, actions: wrapped.actions };
  const labels = useMemo(() => Object.fromEntries(wrapped.sections.map((s) => [s.id, s.label])), [wrapped.sections]);

  const stageRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const effects = useRef<CameraEffects>(null);
  const [stageSize, setStageSize] = useState<Size>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const env: BookEnv = {
      stage,
      world: worldRef.current!,
      store,
      labels,
      reduceMotion: () => live.current.reduceMotion,
      insets: (mode) => INSETS[mode],
      effects: { impact: () => effects.current?.impact() },
      startSection: (sections) => sectionOfAnchor(window.location.hash, sections),
      onStop: (_stop, p) => replaceAnchor(p.sectionId),
      onBackCover: () => live.current.actions.outroReached(),
    };
    controller.attach(env);
    const measure = () => setStageSize({ w: stage.clientWidth, h: stage.clientHeight });
    measure();
    const observer = new ResizeObserver(() => {
      measure();
      controller.relayout();
    });
    observer.observe(stage);
    return () => {
      observer.disconnect();
      controller.detach();
    };
  }, [controller, store, labels]);

  useEffect(() => controller.setScenes(scenes), [controller, scenes]);

  // An anchor followed while the book is open (a link to #team, an edited address) turns to that section. The book's own
  // replacing of the anchor fires no event, so this only ever hears the reader's.
  useEffect(() => {
    const onHashChange = () => {
      const id = sectionOfAnchor(window.location.hash, sectionIds(controller.getSnapshot().pages));
      if (id) controller.goToSection(id);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [controller]);

  // Nothing scrolls under the book: a keypress or a wheel never moves the document behind it.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  const move = useCallback(
    (nav: Nav) => {
      if (nav === "next") controller.next();
      else controller.prev();
    },
    [controller],
  );

  // Keys: Space, → and ↓ go forward; Shift+Space, ← and ↑ back.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const nav = keyNav({
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        target: target ? { tagName: target.tagName, isContentEditable: target.isContentEditable, role: target.getAttribute("role") } : null,
      });
      if (!nav) return;
      e.preventDefault();
      move(nav);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  // The wheel: one gesture, one panel (WheelGesture), so a hard flick of a trackpad can't skip a page.
  useEffect(() => {
    const stage = stageRef.current!;
    const gesture = new WheelGesture();
    const onWheel = (e: WheelEvent) => {
      // A pinch (ctrl+wheel) and a sideways scroll are the browser's.
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const nav = gesture.feed(wheelPixels(e, stage.clientHeight), e.timeStamp);
      if (nav) move(nav);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [move]);

  // Touch: a swipe left goes forward, right back; a tap on the right of the stage forward, on the left back.
  const touch = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = touch.current;
    touch.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const swipe = e.pointerType === "mouse" ? null : swipeNav(dx, dy);
    if (swipe) return move(swipe);
    if (!isTap(dx, dy, e.timeStamp - start.t)) return;
    const target = e.target as HTMLElement;
    // A tap on a button, a link or the controls is theirs; so is a click that ends a text selection.
    if (target.closest(INTERACTIVE_SELECTOR) || target.closest("[data-hud]") || window.getSelection()?.toString()) return;
    const rect = stageRef.current!.getBoundingClientRect();
    const nav = tapNav(e.clientX - rect.left, rect.width);
    if (nav) move(nav);
  };

  // A sound effect or two, as the book opens and as it ends.
  const lastPage = useRef(0);
  useEffect(() => {
    if (!snap.ready) return;
    const was = lastPage.current;
    lastPage.current = snap.pos.page;
    const stage = stageRef.current;
    if (!stage || was === snap.pos.page) return;
    const r = stage.getBoundingClientRect();
    if (was === 0 && snap.pos.page === 1) sfx(r.left + r.width / 2, r.top + r.height * 0.4, { text: "POW!", size: 130 });
  }, [snap.ready, snap.pos.page]);

  const WrappedIntro = useSlot("WrappedIntro");
  const WrappedYou = useSlot("WrappedYou");
  const WrappedDuo = useSlot("WrappedDuo");
  const WrappedCaptain = useSlot("WrappedCaptain");
  const WrappedModerator = useSlot("WrappedModerator");
  const WrappedTeam = useSlot("WrappedTeam");
  const WrappedBingo = useSlot("WrappedBingo");
  const WrappedOutro = useSlot("WrappedOutro");

  // The book's pages, made once per Wrapped: the camera's every step re-renders this page (its snapshot), and remaking
  // the sections' elements with it would re-render the whole book mid-flight, a frame or several dropped at each step.
  const book = useMemo(() => {
    const render = (section: WrappedSectionModel): ReactNode => {
      switch (section.kind) {
        case "intro":
          return <WrappedIntro section={section} preview={wrapped.preview} />;
        case "you":
          return <WrappedYou section={section} />;
        case "duo":
          return <WrappedDuo section={section} />;
        case "captain":
          return <WrappedCaptain section={section} />;
        case "moderator":
          return <WrappedModerator section={section} />;
        case "team":
          return <WrappedTeam section={section} />;
        case "bingo":
          return <WrappedBingo section={section} />;
        case "outro":
          return <WrappedOutro section={section} preview={wrapped.preview} onRewind={wrapped.actions.goToRewind} onBoard={wrapped.actions.goToBoard} feedback={wrapped.feedback && { responded: wrapped.feedback.responded, onOpen: wrapped.actions.goToFeedback }} />;
      }
    };

    // The book: the Intro as its front cover, then the contents page the book adds, then the rest.
    const pages = wrapped.sections.map((s) => (
      <div key={s.id} data-wrapped-section={s.id} className="contents">
        {render(s.section)}
      </div>
    ));
    const contentsAt = wrapped.sections.findIndex((s) => s.id === "intro") + 1;
    pages.splice(
      contentsAt,
      0,
      <div key={CONTENTS_SECTION} data-wrapped-section={CONTENTS_SECTION} className="contents">
        <ContentsPage />
      </div>,
    );
    return pages;
  }, [wrapped, WrappedIntro, WrappedYou, WrappedDuo, WrappedCaptain, WrappedModerator, WrappedTeam, WrappedBingo, WrappedOutro]);

  const atStart = !prevStop(snap.pages, snap.pos);
  const atEnd = !nextStop(snap.pages, snap.pos);
  // Back for another look, a reader who has been to the end can skip to it: the Outro, the share cards then the back cover.
  const outroIndex = snap.pages.findIndex((p) => p.sectionId === "outro");
  const offerSkip = snap.ready && wrapped.outroReachedBefore && outroIndex >= 0 && snap.pos.page < outroIndex;
  const mode = snap.ready ? snap.mode : stageMode(stageSize.w);

  return (
    <ComicPage>
      <div className="flex h-dvh flex-col">
        <AppHeader title="Wrapped" subtitle={wrapped.publishedLabel ?? wrapped.bingoName} menuEntries={menuEntries} controls={wrapped.preview && <Badge tone="warn">Preview</Badge>} {...comicHeaderProps()}>
          {header?.canModerate && <ModPanelLink slug={wrapped.slug} pendingCount={header.pendingCount} />}
        </AppHeader>
        <div
          ref={stageRef}
          role="region"
          aria-label="Wrapped, read as a comic book"
          tabIndex={-1}
          className="wrapped-stage relative min-h-0 flex-1 overflow-hidden outline-none"
          style={{ touchAction: "none", ...DESK[scheme] }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (touch.current = null)}
        >
          <BookContext.Provider value={controller}>
            <div ref={shakeRef} className="absolute inset-0">
              <div ref={worldRef} className="wrapped-world">
                {snap.ready && mode === "wide" && <DeskStickers art={wrapped.sideArt} groups={snap.groups} />}
                <div
                  className="wrapped-book"
                  data-mode={mode}
                  data-ready={snap.ready}
                  data-reduced={reduceMotion}
                  style={{ ...comicVars(page), ...pageTokenVars(page), ["--bw" as string]: `${WRAPPED_PAGE_WIDTH}px`, ["--wrapped-paper-alt" as string]: page.PAPER_ALT }}
                >
                  <PageColorsContext.Provider value={page}>
                    <WrappedProgressProvider source={store} reveal={ComicReveal}>
                      {book}
                    </WrappedProgressProvider>
                    {/* Each page's footer, drawn inside the page whose Scene the section made. */}
                    {snap.pages.map((p, i) => {
                      const el = scenes.find((s) => s.id === p.sceneId)?.element;
                      if (!el || p.no === null) return null;
                      // The number on the outer edge: a spread's left page on its left, any other page on its right.
                      const spread = snap.groups[p.group]?.pages ?? [];
                      const side = spread.length > 1 && spread[0] === i ? "left" : "right";
                      return createPortal(<PageFooter colors={page} side={side} no={p.no} role={p.role} />, el, p.sceneId);
                    })}
                  </PageColorsContext.Provider>
                </div>
              </div>
            </div>
          </BookContext.Provider>
          <CameraFx ref={effects} shake={shakeRef} />

          {offerSkip && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3" data-hud>
              <ComicButton variant="yellow" size="sm" sfx={false} className="pointer-events-auto" onPress={() => controller.goToSection("outro")}>
                Skip to the end
                <ArrowRightIcon />
              </ComicButton>
            </div>
          )}

          <Hud pages={snap.pages} pos={snap.pos} atStart={atStart} atEnd={atEnd} onContents={() => controller.goToContents()} onPrev={() => controller.prev()} onNext={() => controller.next()} />
          <p aria-live="polite" className="sr-only">
            {snap.ready ? announcement(snap.pages, snap.pos) : ""}
          </p>
        </div>
      </div>
    </ComicPage>
  );
}

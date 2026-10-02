import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "motion/react";
import { useBingoHeader, useBingoMenuEntries, useWrappedModel } from "../../../headless";
import type { WrappedSectionModel } from "../../../headless/types";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Badge } from "../../../core/ui/Card";
import { ArrowRightIcon } from "../../../core/ui/icons";
import { createWrappedProgressStore, useWrappedScenes, WrappedProgressProvider } from "../../../core/wrapped/sceneProgress";
import { useSlot } from "../../context";
import { pageColors } from "../board/colors";
import { PageFooter } from "../board/PageFooter";
import { PageEdgeTicks } from "../board/ClosedBook";
import { useEdgeSwipe } from "../board/useEdgeSwipe";
import { ComicPage } from "../fx/ComicPage";
import { sfx } from "../fx/SfxLayer";
import { comicHeaderProps } from "../page/headerStyle";
import { ModPanelLink } from "../page/Masthead";
import { ComicButton } from "../ui/ComicButton";
import { comicVars, PageColorsContext, useComic } from "../ui/useComic";
import { BookController, type BookEnv } from "./BookController";
import { BookContext, pageTokenVars } from "./bookContext";
import { DeskStickers as Desk } from "./Desk";
import { ComicReveal, PanelFocusContext } from "./ComicReveal";
import { ContentsPage } from "./ContentsPage";
import { INTERACTIVE_SELECTOR, isTap, keyNav, swipeNav, tapNav, WheelGesture, wheelPixels, type Nav } from "./controls";
import { CONTENTS_SECTION, nextStop, prevStop, sectionIds, sectionOfAnchor } from "./guide";
import { Hud, announcement } from "./Hud";
import { stageMode, WRAPPED_PAGE_WIDTH, type Insets, type Size, type StageMode } from "./camera";
import { FoldLayer } from "./pageTurn";

/** The room the HUD and the edges leave around the book in the stage. */
const INSETS: Record<StageMode, Insets> = {
  phone: { top: 10, right: 10, bottom: 62, left: 10 },
  wide: { top: 14, right: 24, bottom: 82, left: 24 },
};
/** The page's border (px), which a peel's fold-back outlines at the same weight. */
const PAGE_BORDER = 3;
/** The strips along a phone's page edges that turn it by touch (as the Tile book's: clear of the OS's own edge swipe). */
const EDGE_ZONE_INSET = 4;
const EDGE_ZONE_WIDTH = 44;

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
 * each section is a page or two of panels, and the Outro is the back cover. The camera moves from panel to panel, pulling
 * back at the end of a page before the page is turned. Nothing scrolls: the sections are the ordinary Wrapped sections
 * (WrappedScene and Reveal), told by this page how far they are reached (core/wrapped/sceneProgress), and drawn as panels.
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
  const { colors } = useComic();
  const page = pageColors(colors);

  // What the controller reads while it runs, kept current without re-attaching it.
  const live = useRef({ reduceMotion, page, actions: wrapped.actions });
  live.current = { reduceMotion, page, actions: wrapped.actions };
  const labels = useMemo(() => Object.fromEntries(wrapped.sections.map((s) => [s.id, s.label])), [wrapped.sections]);

  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<Size>({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const env: BookEnv = {
      stage,
      world: worldRef.current!,
      book: bookRef.current!,
      store,
      labels,
      reduceMotion: () => live.current.reduceMotion,
      insets: (mode) => INSETS[mode],
      peelStyle: () => ({ paper: live.current.page.PAPER, ink: live.current.page.LINE, borderWidth: PAGE_BORDER }),
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
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0) || (e.target as HTMLElement).closest("[data-edge-zone]")) return;
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
        return <WrappedOutro section={section} preview={wrapped.preview} onRewind={wrapped.actions.goToRewind} onBoard={wrapped.actions.goToBoard} />;
    }
  };

  // The book: the Intro as its front cover (on a hinge, so it opens), then the contents page the book adds, then the rest.
  const book = wrapped.sections.map((s) =>
    s.id === "intro" ? (
      <div key={s.id} data-wrapped-section={s.id} data-cover-hinge className="wrapped-cover-hinge">
        {render(s.section)}
        <div aria-hidden className="wrapped-cover-inside" />
      </div>
    ) : (
      <div key={s.id} data-wrapped-section={s.id} className="contents">
        {render(s.section)}
      </div>
    ),
  );
  const contentsAt = wrapped.sections.findIndex((s) => s.id === "intro") + 1;
  book.splice(
    contentsAt,
    0,
    <div key={CONTENTS_SECTION} data-wrapped-section={CONTENTS_SECTION} className="contents">
      <ContentsPage />
    </div>,
  );

  const atStart = !prevStop(snap.pages, snap.pos);
  const atEnd = !nextStop(snap.pages, snap.pos);
  const backIndex = snap.pages.findIndex((p) => p.kind === "back");
  const offerSkip = snap.ready && wrapped.outroReachedBefore && backIndex >= 0 && snap.pos.page < backIndex;
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
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (touch.current = null)}
        >
          <BookContext.Provider value={controller}>
            <PanelFocusContext.Provider value={snap.focus}>
              {snap.ready && mode === "wide" && wrapped.sideArt.length > 0 && (
                <Desk art={wrapped.sideArt} page={snap.pos.page} stage={stageSize} insets={INSETS.wide} bookHeight={snap.bookHeight} reduceMotion={reduceMotion} />
              )}
              <div ref={worldRef} className="wrapped-world" style={{ width: WRAPPED_PAGE_WIDTH }}>
                <div
                  ref={bookRef}
                  className="wrapped-book"
                  data-mode={mode}
                  data-ready={snap.ready}
                  data-reduced={reduceMotion}
                  style={{ ...comicVars(page), ...pageTokenVars(page), width: WRAPPED_PAGE_WIDTH, ["--bw" as string]: `${WRAPPED_PAGE_WIDTH}px`, ["--wrapped-paper-alt" as string]: page.PAPER_ALT }}
                >
                  <PageColorsContext.Provider value={page}>
                    <WrappedProgressProvider source={store} reveal={ComicReveal}>
                      {book}
                    </WrappedProgressProvider>
                    {/* Each page's footer and edge ticks, drawn inside the page whose Scene the section made. */}
                    {snap.pages.map((p) => {
                      const el = scenes.find((s) => s.id === p.sceneId)?.element;
                      if (!el || p.no === null) return null;
                      return createPortal(
                        <>
                          <PageEdgeTicks colors={page} side="front" />
                          <PageFooter colors={page} side="right" no={p.no} role={p.role} />
                        </>,
                        el,
                        p.sceneId,
                      );
                    })}
                  </PageColorsContext.Provider>
                  <FoldLayer />
                </div>
              </div>
            </PanelFocusContext.Provider>
          </BookContext.Provider>

          {mode === "phone" && snap.ready && (
            <>
              <EdgeZone side="right" controller={controller} onTap={move} />
              <EdgeZone side="left" controller={controller} onTap={move} />
            </>
          )}

          {offerSkip && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3" data-hud>
              <ComicButton variant="yellow" size="sm" sfx={false} className="pointer-events-auto" onPress={() => controller.goToBackCover()}>
                Skip to the back cover
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

/**
 * A strip down one edge of the phone's screen that turns the page: a drag toward the spine peels it, as the Tile book's
 * edge swipe does. Taps on it are taps on that side of the stage.
 */
function EdgeZone({ side, controller, onTap }: { side: "left" | "right"; controller: BookController; onTap: (nav: Nav) => void }) {
  const forward = side === "right";
  // The page isn't taken in hand until the finger has moved across: a tap on the strip is a tap, not a turn that is let go.
  const begun = useRef(false);
  const handlers = useEdgeSwipe({
    dir: forward ? -1 : 1,
    onBegin: () => controller.canDrag(forward),
    onProgress: (travel, y) => {
      if (!begun.current) begun.current = controller.beginDrag(forward);
      if (begun.current) controller.dragTo(travel, y);
    },
    onEnd: (result) => {
      if (!begun.current) return;
      begun.current = false;
      void controller.endDrag(result);
    },
    onScroll: () => {},
    onScrollEnd: () => {},
    onTap: ({ x, y }, zone) => {
      // What's under the strip takes the tap if it is a control; otherwise it's a tap on this side.
      const under = document.elementsFromPoint(x, y).find((el) => !zone.contains(el));
      const control = under?.closest<HTMLElement>(INTERACTIVE_SELECTOR);
      if (control) control.click();
      else onTap(forward ? "next" : "prev");
    },
  });
  return (
    <div
      aria-hidden
      data-edge-zone={side}
      className="absolute inset-y-0 z-20"
      style={{ width: EDGE_ZONE_WIDTH, touchAction: "none", [side]: EDGE_ZONE_INSET }}
      {...handlers}
    />
  );
}

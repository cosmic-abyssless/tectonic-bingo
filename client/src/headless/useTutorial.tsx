import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useMarkTutorialSeen } from "../api/queries";
import { NavMenuControlContext } from "../core/ui/headerMenu";
import { useUrlParam } from "../core/ui/useUrlParam";
import { useBingoPageRaw, useBingoPage } from "./BingoPageProvider";
import { useTileModel } from "./BoardProvider";
import { TUTORIAL_IDLE, TUTORIAL_STEP_COUNT, tutorialAutoStarts, tutorialReducer, tutorialSteps, tutorialTileFacts, type TutorialAction, type TutorialOpening, type TutorialState, type TutorialStep } from "./tutorial";
import type { TutorialCardModel } from "./types";

/**
 * The Tutorial (CONTEXT.md) on a Bingo's Board: which step it's on, and Start / Next / Back / Skip / Finish. Core's
 * TutorialOverlay highlights the step's element and places the card (the TutorialCard slot); a theme whose element
 * can be out of view (the comic Tile's pages) reads `step.targets` to bring it into view.
 */
export interface TutorialModel {
  active: boolean;
  /** The current step while active. */
  step: TutorialStep | null;
  card: TutorialCardModel | null;
  /** Whether ☰ → Tutorial can replay it here: while Live, on a Team's Board. */
  canReplay: boolean;
  /** Replays it from the start (the ☰ entry). A replay never changes whether the account has seen it. */
  start(): void;
  next(): void;
  back(): void;
  /** Ends it early; like finishing, records it seen (unless it's a replay). */
  skip(): void;
  finish(): void;
  /** The current step's element isn't there: pass over it (only an optional step can be passed over). */
  pass(): void;
}

interface TutorialContextValue {
  model: TutorialModel;
  /** While the Tutorial waits for (or explains) the Submit flow: the Tile opened at step 3 and its first open Part, for the flow to start on. */
  submitSeed: { tileId: string; taskId: string | undefined } | null;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

/** The Board's Tutorial, or null outside a Bingo page. */
export function useTutorial(): TutorialModel | null {
  return useContext(TutorialContext)?.model ?? null;
}

/** For SubmissionFlowHost: what the Submit flow starts on when the Tutorial opens it (see submitSeed). */
export function useTutorialSubmitSeed(): TutorialContextValue["submitSeed"] {
  return useContext(TutorialContext)?.submitSeed ?? null;
}

/**
 * Holds the Tutorial for a Bingo page: under BingoPageProvider (whose Tile modal and Submit flow it watches) and
 * BoardProvider (for the opened Tile). It also owns the header ☰'s open state, so it can wait for the Player to open
 * it and close it again.
 */
export function TutorialProvider({ children }: { children: ReactNode }) {
  const page = useBingoPage();
  const { tiles } = useBingoPageRaw();
  const { user, confirmed } = useAuth();
  const markSeen = useMarkTutorialSeen();
  const [state, setState] = useState(TUTORIAL_IDLE);
  const [navMenuOpen, setNavMenuOpen] = useState(false);

  const tileOpen = page.openTile.id !== null;
  const tileId = state.tileId ?? page.openTile.id;
  const facts = tutorialTileFacts(tiles.find((t) => t.id === tileId));
  const steps = useMemo(() => tutorialSteps(facts), [facts.needsProof, facts.pointsWait]); // eslint-disable-line react-hooks/exhaustive-deps
  const dispatch = (action: TutorialAction) => setState((s) => tutorialReducer(steps, s, action));
  const step = state.active ? (steps[state.index] ?? null) : null;

  const onOwnTeamBoard = page.stageView === "board" && !!page.myTeam && page.viewing.team?.id === page.myTeam.id;
  const canReplay = page.bingo.stage === "live" && page.stageView === "board" && !!page.viewing.team;

  // Once per account, the first time a Player sees their own Team's Board while Live (and only once /api/me has said
  // whether they've seen it: the record cached from last time may be stale). It starts right away, whatever's open.
  const autoStarts = confirmed && !!user && tutorialAutoStarts({ stage: page.bingo.stage, onOwnTeamBoard, seen: !!user.tutorialSeenAt });
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStarts || autoStarted.current) return;
    autoStarted.current = true;
    dispatch({ type: "start", replay: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStarts]);

  // ☰ → Tutorial from a page away from the Board comes here with ?open=tutorial (see useBingoMenuEntries). The Board
  // picks the viewer's Team a moment after it loads, so wait for it, unless there's no Team Board to wait for.
  const [openOnArrival, setOpenOnArrival] = useUrlParam("open");
  useEffect(() => {
    if (openOnArrival !== "tutorial") return;
    if (canReplay) dispatch({ type: "start", replay: true });
    else if (page.myTeam && page.bingo.stage === "live") return;
    setOpenOnArrival(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnArrival, canReplay]);

  // The real opens and closes move it: a ✋ step goes on once its thing is open, and closing what a step explains
  // steps back to the step that opens it.
  useOpenEvents("tile", tileOpen, state, dispatch, page.openTile.id);
  useOpenEvents("submit", page.submit.open, state, dispatch);
  useOpenEvents("menu", navMenuOpen, state, dispatch);

  // Finished or skipped (not a replay): recorded on the account, so it doesn't start again anywhere.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !state.active && !state.replay) markSeen.mutate();
    wasActive.current = state.active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active]);

  const close = (what: TutorialOpening) => {
    if (what === "tile") page.openTile.close();
    else if (what === "submit") page.submit.hide();
    else setNavMenuOpen(false);
  };
  const next = () => {
    if (!step || step.waitsFor) return;
    dispatch({ type: "next" });
    if (step.closes) close(step.closes);
  };
  const end = () => {
    // Nothing is ever Submitted: the Submit flow it opened goes with it.
    if (step?.inside === "submit") close("submit");
    dispatch({ type: "end" });
  };
  const isLast = state.index === steps.length - 1;

  const model: TutorialModel = {
    active: state.active,
    step,
    card: step
      ? {
          title: step.title,
          lines: step.lines,
          number: step.number,
          count: TUTORIAL_STEP_COUNT,
          primary: step.waitsFor ? null : { label: state.index === 0 ? "Start" : isLast ? "Finish" : "Next", onPress: next },
          onSkip: end,
        }
      : null,
    canReplay,
    start: () => dispatch({ type: "start", replay: true }),
    next,
    back: () => dispatch({ type: "back" }),
    skip: end,
    finish: next,
    pass: () => {
      if (!step?.optional) return;
      // Passing forward over a step that closes what it explains closes it too, as its Next would have.
      if (state.direction === 1 && step.closes) close(step.closes);
      dispatch({ type: "pass" });
    },
  };

  // The Submit flow opened at step 6 starts on the Tile from step 3 (and its first Part still open), so step 7 can
  // point at what you got and, where the Tile needs one, the Proof screenshot. Only a Tile that can take a Submission.
  const seedTile = useTileModel(state.tileId);
  const seeding = !!step && (step.waitsFor === "submit" || step.inside === "submit");
  const submitSeed = seeding && seedTile?.canSubmit ? { tileId: seedTile.id, taskId: seedTile.tasks.find((t) => t.available)?.id } : null;

  return (
    <TutorialContext.Provider value={{ model, submitSeed }}>
      <NavMenuControlContext.Provider value={{ isOpen: navMenuOpen, onOpenChange: setNavMenuOpen }}>{children}</NavMenuControlContext.Provider>
    </TutorialContext.Provider>
  );
}

function useOpenEvents(what: TutorialOpening, isOpen: boolean, state: TutorialState, dispatch: (action: TutorialAction) => void, tileId: string | null = null) {
  useEffect(() => {
    if (!state.active) return;
    dispatch(isOpen ? { type: "opened", what, tileId } : { type: "closed", what });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, state.active, state.index]);
}

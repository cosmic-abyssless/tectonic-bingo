import { useEffect, useState, type CSSProperties } from "react";
import { useSlot } from "../../themes/context";
import { motion, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import type { DraftTeam, PickRating } from "@bingo/shared";
import { useAuth } from "../../context/AuthContext";
import { queryKeys, useBingo, useDraftState, useMakePick, useSetDraftOrder, useSetPickRating, useShuffleDraftOrder, useSignupQuestions, useStartDraft, useUndoPick } from "../../api/queries";
import { Button, IconButton } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { ChevronDownIcon, ChevronUpIcon } from "../ui/icons";
import { useElementHeight } from "../ui/useElementHeight";
import { DraftPoolGrid } from "./DraftPoolGrid";
import { usePreference } from "../ui/preferences";
import { TeamRoster, pairPickRows } from "./TeamRoster";
import { DraftPickReveal } from "./DraftPickReveal";
import { namesForPick } from "./revealMath";
import { useDraftReveals } from "./useDraftReveals";
import { UndoPick } from "./UndoPick";
import { FinalTeams } from "./FinalTeams";

// Themeable via --font-heading/--font-heading-weight (set by ThemeProvider
// from tokens.chrome.headingFont/headingWeight); both fall back to a no-op
// (this element's own weight class) outside a themed page, or when a theme
// sets a font but not a weight.
const HEADING_FONT: CSSProperties = { fontFamily: "var(--font-heading, inherit)", fontWeight: "var(--font-heading-weight, revert)" };

function PickOrderDialog({
  isOpen,
  onClose,
  teams,
  onSave,
  saving,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  teams: DraftTeam[];
  onSave: (teamIds: string[]) => Promise<void>;
  saving: boolean;
  error: string | null;
}) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (isOpen) setIds(teams.map((t) => t.id));
  }, [isOpen, teams]);
  const byId = new Map(teams.map((t) => [t.id, t]));

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
    setIds(next);
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <DialogHeader title="Pick order" subtitle="First in the list picks first." onClose={onClose} />
      <div className="space-y-4 p-5">
        <ol className="space-y-1">
          {ids.map((id, i) => {
            const team = byId.get(id);
            if (!team) return null;
            return (
              <li key={id} className="flex items-center gap-2 rounded-md border border-outline bg-surface px-2 py-1.5">
                <span className="num w-6 shrink-0 text-xs text-on-surface-subtle">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-on-surface">{team.name}</span>
                <IconButton label="Move up" size="sm" onPress={() => move(i, -1)} isDisabled={i === 0}>
                  <ChevronUpIcon />
                </IconButton>
                <IconButton label="Move down" size="sm" onPress={() => move(i, 1)} isDisabled={i === ids.length - 1}>
                  <ChevronDownIcon />
                </IconButton>
              </li>
            );
          })}
        </ol>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onPress={() => onSave(ids)} isDisabled={saving || ids.length < 2}>
            {saving ? "Saving…" : "Save order"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// Not <Card>: the teams and the pool need a raised fill + stronger border than Card's surface/outline, which vanish
// into the dark themes' backdrop.
const DRAFT_PANEL = "rounded-lg border border-outline-strong bg-surface-raised p-4 shadow-[0_2px_10px_var(--color-shade)]";

export function DraftRoom({ slug }: { slug: string }) {
  const { user } = useAuth();
  // Whether the pool table breaks out of max-w-5xl (the switch for it lives in DraftPoolGrid's toolbar).
  const [poolWidth] = usePreference("draftPoolWidth");
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const { data: shell } = useBingo(slug);
  const { data: state, error: stateError } = useDraftState(slug);
  const { data: questionsData } = useSignupQuestions(slug);
  const shuffleOrder = useShuffleDraftOrder(slug);
  const setOrder = useSetDraftOrder(slug);
  const startDraft = useStartDraft(slug);
  const makePick = useMakePick(slug);
  const undoPick = useUndoPick(slug);
  const [undoError, setUndoError] = useState<string | null>(null);
  const setRating = useSetPickRating(slug);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const OnTheClockBanner = useSlot("OnTheClockBanner");
  const reveals = useDraftReveals(shell?.bingo.id, state);
  // The teams stay pinned under the page header while the pool scrolls — headerHeight is its own sticky `top`
  // offset. The pool table's height is no longer derived from this (DraftPoolGrid measures its own position via
  // useDocumentTop now, matching the signup roster), so there's no teamsHeight to measure alongside it any more.
  const [pageHeader, setPageHeader] = useState<Element | null>(null);
  useEffect(() => setPageHeader(document.querySelector("header")), []);
  const headerHeight = useElementHeight(pageHeader);
  // The on-the-clock banner pins under the page header; the teams row pins under the banner.
  const [bannerEl, setBannerEl] = useState<HTMLDivElement | null>(null);
  const bannerHeight = useElementHeight(bannerEl) * (bannerEl ? 1 : 0);

  useEffect(() => {
    if (!state?.orderLockedUntil) return;
    const remaining = new Date(state.orderLockedUntil).getTime() - Date.now();
    if (remaining <= 0) return;
    const t = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.draftState(slug) });
    }, remaining + 50);
    return () => window.clearTimeout(t);
  }, [state?.orderLockedUntil, queryClient, slug]);

  if (stateError) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-6">
        <Notice tone="danger">{stateError instanceof Error ? stateError.message : "Couldn't load the draft"}</Notice>
      </div>
    );
  }
  if (!shell || !state || !user) {
    return <div className="py-24 text-center text-on-surface-muted">Loading…</div>;
  }

  const isMod = shell.isMod;
  // The pick-on-behalf-of override is site-admin only — a regular per-bingo
  // mod who isn't also a site admin doesn't get it, only the acting team
  // lead (captain or co-captain) does. Matches draftService.makePick.
  const isAdmin = !!user.isAdmin;
  const myTeam = state.teams.find((t) => t.captainUserId === user.id || t.coCaptain?.userId === user.id) ?? null;
  const isLead = myTeam !== null;
  const pairRows = pairPickRows(state.teams.map((t) => state.picks.filter((p) => p.teamId === t.id)));
  const currentTeam = state.currentPick ? (state.teams.find((t) => t.id === state.currentPick!.teamId) ?? null) : null;
  const isMyTurn = !!myTeam && currentTeam?.id === myTeam.id;
  const canAct = !!state.currentPick && (isAdmin || isMyTurn);
  // Before the draft stage the room is a scouting view: leads (and mods)
  // browse and rate signups; nothing can start or be picked yet.
  const scouting = shell.bingo.stage !== "draft";
  const poolCount = state.pool.reduce((n, u) => n + u.entries.length, 0);
  const questions = questionsData?.questions ?? [];
  const lockMs = state.orderLockedUntil ? Math.max(0, new Date(state.orderLockedUntil).getTime() - Date.now()) : 0;
  const revealing = lockMs > 0;
  const revealedTeam = reveals.active ? (state.teams.find((t) => t.id === reveals.active!.teamId) ?? null) : null;
  const draftComplete = !scouting && state.draftStarted && !state.currentPick && !revealing && state.picks.length > 0;
  const canControlOrder = isAdmin && !scouting && state.picks.length === 0;
  // Only the latest pick can be taken back (an admin's fix for a misclick).
  const latestPickNumber = state.picks.reduce((max, p) => Math.max(max, p.pickNumber), 0);
  const latestPick = state.picks.find((p) => p.pickNumber === latestPickNumber);
  const latestPickTeam = latestPick ? (state.teams.find((t) => t.id === latestPick.teamId) ?? null) : null;
  const canUndo = isAdmin && !scouting && state.draftStarted && !!latestPick && !!latestPickTeam;
  const busy = shuffleOrder.isPending || setOrder.isPending || startDraft.isPending;

  async function handleShuffle() {
    setOrderError(null);
    try {
      await shuffleOrder.mutateAsync();
    } catch (e: unknown) {
      setOrderError(e instanceof Error ? e.message : "Failed to shuffle pick order");
    }
  }

  async function handleSaveOrder(teamIds: string[]) {
    setOrderError(null);
    try {
      await setOrder.mutateAsync(teamIds);
      setOrderOpen(false);
    } catch (e: unknown) {
      setOrderError(e instanceof Error ? e.message : "Failed to set pick order");
    }
  }

  async function handleStart() {
    setOrderError(null);
    try {
      await startDraft.mutateAsync();
    } catch (e: unknown) {
      setOrderError(e instanceof Error ? e.message : "Failed to start the draft");
    }
  }

  async function handlePick(pickedUserId: string) {
    setPickError(null);
    try {
      await makePick.mutateAsync(pickedUserId);
    } catch (e: unknown) {
      setPickError(e instanceof Error ? e.message : "Failed to make that pick");
    }
  }

  async function handleUndo(): Promise<boolean> {
    setUndoError(null);
    try {
      await undoPick.mutateAsync();
      return true;
    } catch (e: unknown) {
      setUndoError(e instanceof Error ? e.message : "Failed to undo that pick");
      return false;
    }
  }

  async function handleRate(signupId: string, rating: PickRating) {
    setRateError(null);
    try {
      await setRating.mutateAsync({ signupId, rating });
    } catch (e: unknown) {
      setRateError(e instanceof Error ? e.message : "Failed to save that rating");
    }
  }

  return (
    // Only the pool table itself goes full width — everything above it (status/notices, the teams row, "Available
    // players" heading) stays at the original reading width (max-w-5xl). A Fragment root, not one div, so the
    // table can sit as a sibling unconstrained by the narrow block's own max-width rather than needing a
    // negative-margin breakout trick.
    <div>
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-6">
        {scouting ? (
          <Notice tone="info">
            Scouting. Signups are {shell.bingo.stage === "signup" ? "still open" : "closed"} — the draft starts once the mods move the bingo to the draft stage.
            {isLead && " Star and note players now; your team's ratings carry over into the draft."}
          </Notice>
        ) : !state.draftStarted ? (
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-on-surface">The draft hasn't started</p>
                <p className="text-sm text-on-surface-muted">
                  {state.teams.length} team{state.teams.length === 1 ? "" : "s"}.{" "}
                  {state.teams.length < 2
                    ? "Create at least 2 teams from the mod panel first."
                    : state.orderReady
                      ? revealing
                        ? "Revealing pick order."
                        : "Pick order is set."
                      : "Shuffle or set pick order, then start."}
                </p>
                {orderError && <p className="mt-1 text-sm text-danger">{orderError}</p>}
              </div>
              {canControlOrder && (
                <div className="flex flex-wrap gap-2">
                  <Button onPress={handleShuffle} isDisabled={state.teams.length < 2 || busy}>
                    {shuffleOrder.isPending ? "Shuffling…" : "Shuffle pick order"}
                  </Button>
                  <Button onPress={() => { setOrderError(null); setOrderOpen(true); }} isDisabled={state.teams.length < 2 || busy}>
                    Pick order
                  </Button>
                  <Button variant="primary" onPress={handleStart} isDisabled={!state.orderReady || busy}>
                    {startDraft.isPending ? "Starting…" : "Start draft"}
                  </Button>
                </div>
              )}
            </div>
            {state.teams.length > 0 && (
              <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {/* The order stays hidden while it is being revealed below. */}
                {state.teams.map((team) => (
                  <li key={team.id} className="flex min-w-0 items-center gap-2.5 rounded-md border border-outline bg-surface px-3 py-2">
                    {state.orderReady && !revealing && team.draftOrder != null && <span className="num w-5 shrink-0 text-sm font-semibold text-on-surface-subtle">{team.draftOrder}</span>}
                    <span className="size-3 shrink-0 rounded-full border border-outline-strong" style={{ backgroundColor: team.color ?? "transparent" }} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-on-surface">{team.name}</div>
                      <div className="truncate text-xs text-on-surface-muted">
                        {[team.captainRsn || "?", team.coCaptain?.rsn].filter(Boolean).join(" & ")}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ) : state.currentPick && currentTeam && !revealing ? (
          // Pinned under the page header while the pool scrolls; the teams row below pins under it.
          <div ref={setBannerEl} className="sticky z-20 -mx-2 px-2 pb-1 pt-1" style={{ top: headerHeight }}>
            <OnTheClockBanner
              key={state.currentPick.pickNumber}
              teamName={currentTeam.name}
              teamColor={currentTeam.color ?? null}
              captains={[currentTeam.captainRsn || "?", ...(currentTeam.coCaptain ? [currentTeam.coCaptain.rsn || "?"] : [])]}
              pickLabel={`${state.currentPick.singlesRound ? "Singles round" : `Round ${state.currentPick.round}`} · Pick ${state.currentPick.pickNumber}`}
              isMyTurn={isMyTurn}
            />
          </div>
        ) : revealing ? (
          <Notice tone="info">Revealing pick order.</Notice>
        ) : !state.currentPick && canControlOrder ? (
          <Notice tone="info">Draft started.</Notice>
        ) : (
          <Notice tone="ok">
            Draft complete. {isMod ? "Advance to the reveal stage from the mod panel when you're ready." : "The board is revealed next."}
            {poolCount > 0 && (
              <>
                {" "}
                <span className="num">{poolCount}</span> leftover signup{poolCount === 1 ? " was" : "s were"} not drafted.
              </>
            )}
            {state.cutCount > 0 && (
              <>
                {" "}
                <span className="num">{state.cutCount}</span> signup{state.cutCount === 1 ? " was" : "s were"} cut.
              </>
            )}
          </Notice>
        )}

        {canUndo && (
          <UndoPick
            // Reset the confirmation whenever the latest pick changes underneath it.
            key={latestPickNumber}
            pickNumber={latestPickNumber}
            names={namesForPick(state.picks, latestPickNumber)}
            teamName={latestPickTeam!.name}
            busy={undoPick.isPending}
            error={undoError}
            onUndo={handleUndo}
          />
        )}

        {draftComplete ? (
          <FinalTeams teams={state.teams} picks={state.picks} myUserId={user.id} />
        ) : (
        <section className={`sticky z-10 ${DRAFT_PANEL}`} style={{ top: headerHeight + bannerHeight }}>
          <h3 className="mb-2 text-sm font-semibold text-on-surface" style={HEADING_FONT}>
            Teams
          </h3>
          {/* grid-flow-col + a minimum column width, in a scrollable row —
              handles a handful of teams (spread to fill width) and a large
              number of teams (scrolls instead of squeezing RSNs unreadable). */}
          <div className="max-h-[36vh] overflow-auto">
            <div className="grid auto-cols-[minmax(140px,1fr)] grid-flow-col gap-3">
              {state.teams.map((team) => (
                <motion.div
                  key={team.id}
                  layout
                  transition={
                    reducedMotion || !revealing
                      ? { duration: 0 }
                      : { type: "tween", duration: Math.min(2, Math.max(0.4, lockMs / 1000)), ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  <TeamRoster
                    team={team}
                    picks={state.picks.filter((p) => p.teamId === team.id)}
                    isCurrent={currentTeam?.id === team.id}
                    showOrder={state.orderReady}
                    hiddenPickNumbers={reveals.hiddenPickNumbers}
                    reserveCoCaptainRow={state.teams.some((t) => t.coCaptain)}
                    pairRows={pairRows}
                  />
                </motion.div>
              ))}
            </div>
          </div>
          {state.teams.length === 0 && <p className="text-sm text-on-surface-subtle">No teams yet.</p>}
        </section>
        )}

        {revealedTeam && reveals.active && (
          <DraftPickReveal
            key={reveals.active.pickNumber}
            pick={reveals.active}
            names={namesForPick(state.picks, reveals.active.pickNumber)}
            teamName={revealedTeam.name}
            teamColor={revealedTeam.color}
            hurry={reveals.waiting > 0}
            onArrive={reveals.arrive}
            onDone={reveals.finish}
          />
        )}

        <PickOrderDialog
          isOpen={orderOpen}
          onClose={() => setOrderOpen(false)}
          teams={state.teams}
          onSave={handleSaveOrder}
          saving={setOrder.isPending}
          error={orderError}
        />

        {(pickError || rateError || state.tectonicUnavailable) && (
          <section>
            {(pickError || rateError) && (
              <Notice tone="danger" className="mb-2">
                {pickError ?? rateError}
              </Notice>
            )}
            {state.tectonicUnavailable && (
              <Notice tone="warn" className="mb-2">
                The clan API is unavailable right now, so tiers, records and event placements are hidden.
              </Notice>
            )}
          </section>
        )}
      </div>

      {/* The one thing that actually breaks out of max-w-5xl above (while "Full width" is on) — everything else in
          this component (the status cards, the teams row, the pick/clan-API notices) stays reading-width. */}
      <div className={`mt-6 w-full px-6 pb-6 ${poolWidth === "narrow" ? "mx-auto max-w-5xl" : ""}`}>
        {/* The Captain on the clock gets the pool framed in their team's colour, on top of the banner everyone sees. */}
        <div
          className={`${DRAFT_PANEL} transition-shadow`}
          style={isMyTurn ? { borderColor: currentTeam?.color ?? "var(--color-accent)", boxShadow: `0 0 0 4px ${currentTeam?.color ?? "var(--color-accent)"}, 0 0 24px ${currentTeam?.color ?? "var(--color-accent)"}` } : undefined}
        >
          <DraftPoolGrid
            pool={state.pool}
            questions={questions}
            ratings={isLead ? state.ratings : null}
            onRate={handleRate}
            canPick={canAct}
            onPick={handlePick}
            picking={makePick.isPending}
            leftoverMode={shell.bingo.leftoverMode}
            heading={
              <h3 className="text-sm font-semibold text-on-surface" style={HEADING_FONT}>
                Available players <span className="num font-normal text-on-surface-subtle">({poolCount})</span>
              </h3>
            }
          />
        </div>
      </div>
    </div>
  );
}

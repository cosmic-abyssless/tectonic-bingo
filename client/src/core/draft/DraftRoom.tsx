import { useEffect, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { formatSignupAnswer, type DraftPoolEntry, type DraftTeam, type DraftUnit, type LeftoverMode, type PickRating, type SignupQuestion, type TectonicProfile } from "@bingo/shared";
import { CaCell, WomCell } from "../signup/caStats";
import { useStatsRefreshingSignupIds } from "../../context/WebSocketContext";
import { useAuth } from "../../context/AuthContext";
import { queryKeys, useBingo, useDraftState, useMakePick, useSetDraftOrder, useSetPickRating, useShuffleDraftOrder, useSignupQuestions, useStartDraft } from "../../api/queries";
import { discordName } from "../ui/user";
import { Button, IconButton } from "../ui/Button";
import { Badge, Card, Notice } from "../ui/Card";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { ColumnPicker } from "../ui/ColumnPicker";
import { useHiddenColumns } from "../ui/hiddenColumns";
import { ChevronDownIcon, ChevronUpIcon, LinkIcon } from "../ui/icons";
import { SortHeader, compareSortValues, useTableSort, type TableSort } from "../ui/tableSort";
import { RatingCell } from "./RatingCell";
import { TeamRoster } from "./TeamRoster";
import { AccountTypeIcon } from "../ui/AccountTypeIcon";
import { AchievementIcons, PlaceBreakdown, TierBadge } from "../tectonic/ProfileBadges";
import { PlayerName } from "../tectonic/PlayerName";
import { podiumSummary, podiumTitle, recordSummary, recordTitle } from "../tectonic/profile";

// Themeable via --font-heading/--font-heading-weight (set by ThemeProvider
// from tokens.chrome.headingFont/headingWeight); both fall back to a no-op
// (this element's own weight class) outside a themed page, or when a theme
// sets a font but not a weight.
const HEADING_FONT: CSSProperties = { fontFamily: "var(--font-heading, inherit)", fontWeight: "var(--font-heading-weight, revert)" };


// "rating" | "rsn" | "discord" | "tier" | "records" | "podiums" | "ehb" | "ehp" | a signup question's id — anything the pool table can sort by.
type SortKey = string;

type Ratings = Record<string, PickRating>;

// Golds outrank silvers outrank bronzes, so a single #1 beats three #3s.
const placeScore = (p: { first: number; second: number; third: number }) => p.first * 10_000 + p.second * 100 + p.third;

function poolSortValue(entry: DraftPoolEntry, key: SortKey, ratings: Ratings): string | number {
  if (key === "rating") return ratings[entry.signup.id]?.stars ?? 0;
  if (key === "rsn") return entry.signup.rsn.toLowerCase();
  if (key === "discord") return discordName(entry.user).toLowerCase();
  if (key === "tier") return entry.tectonicProfile?.points ?? -1;
  if (key === "records") return entry.tectonicProfile ? placeScore(recordSummary(entry.tectonicProfile)) : -1;
  if (key === "podiums") return entry.tectonicProfile ? placeScore(podiumSummary(entry.tectonicProfile)) : -1;
  if (key === "ehb") return entry.womStats?.ehb ?? -1;
  if (key === "ehp") return entry.womStats?.ehp ?? -1;
  if (key === "caCurrent") return entry.caCurrent?.points ?? -1;
  if (key === "caPeak") return entry.caPeak?.points ?? -1;
  return (entry.answers?.find((a) => a.questionId === key)?.value ?? "").toLowerCase();
}

// A duo pair sorts by whichever half ranks first, so the pair sits where its
// stronger/earlier member would on their own.
function sortUnit(unit: DraftUnit, sort: TableSort<SortKey>, ratings: Ratings): DraftUnit {
  const entries = [...unit.entries].sort((a, b) => sort.order(compareSortValues(poolSortValue(a, sort.key, ratings), poolSortValue(b, sort.key, ratings))));
  return { ...unit, entries };
}

// Tier · Records · Podiums · Achievements — the at-a-glance clan signals;
// the full lists live in PlayerProfileDialog.
function ProfileCells({ profile, shown }: { profile: TectonicProfile | null; shown: (id: string) => boolean }) {
  const empty = <td className="whitespace-nowrap py-2 pr-4 text-on-surface-subtle">—</td>;
  if (!profile) {
    return (
      <>
        {shown("tier") && empty}
        {shown("records") && <td className="py-2 pr-4" />}
        {shown("podiums") && <td className="py-2 pr-4" />}
        {shown("achievements") && <td className="py-2 pr-4" />}
      </>
    );
  }
  const podiums = podiumSummary(profile);
  return (
    <>
      {shown("tier") && (
        <td className="whitespace-nowrap py-2 pr-4">
          <TierBadge profile={profile} />
        </td>
      )}
      {shown("records") && (
        <td className="num py-2 pr-4 text-on-surface-muted" title={recordTitle(profile)}>
          <PlaceBreakdown {...recordSummary(profile)} />
        </td>
      )}
      {shown("podiums") && (
        <td className="num py-2 pr-4 text-on-surface-muted" title={podiumTitle(profile)}>
          <PlaceBreakdown {...podiums} />
          {podiums.bingoWins > 0 && <span className="ml-1 text-xs text-on-surface-subtle">({podiums.bingoWins} bingo)</span>}
        </td>
      )}
      {shown("achievements") && (
        <td className="py-2 pr-4">
          <AchievementIcons profile={profile} />
        </td>
      )}
    </>
  );
}

// The Draft button stays pinned to the right edge while the table scrolls sideways. It needs the card's own
// background so the columns scrolling under it are hidden, and it draws the row divider itself (a sticky cell paints
// over the table's collapsed borders) plus a soft edge on its left.
// (Whole class strings, not built up: Tailwind only generates classes it can find written out in the source.)
const STICKY_HEADER = "sticky right-0 bg-surface shadow-[inset_0_-1px_0_0_var(--color-outline),-8px_0_8px_-8px_rgb(0_0_0/0.25)]";
const STICKY_CELL = "sticky right-0 bg-surface shadow-[inset_0_1px_0_0_var(--color-outline),-8px_0_8px_-8px_rgb(0_0_0/0.25)]";

function PoolTable({
  pool,
  questions,
  ratings,
  onRate,
  canPick,
  onPick,
  picking,
  leftoverMode,
}: {
  pool: DraftUnit[];
  questions: SignupQuestion[];
  /** Present only for team leads — they see and edit their own team's ratings. */
  ratings: Ratings | null;
  onRate: (signupId: string, rating: PickRating) => void;
  canPick: boolean;
  onPick: (userId: string) => void;
  picking: boolean;
  leftoverMode: LeftoverMode;
}) {
  // Leads land on their favourites first; the toggle flips to ascending.
  const sort = useTableSort<SortKey>(ratings ? "rating" : "rsn", ratings ? "desc" : "asc");
  const ratingOf = ratings ?? {};
  const [hiddenColumns, setHiddenColumns] = useHiddenColumns("draftPool");
  const shown = (id: string) => !hiddenColumns.has(id);
  const statsRefreshing = useStatsRefreshingSignupIds();
  const entries = pool.flatMap((u) => u.entries);
  // Answers are only sent to mods/captains (see draftService.getDraftState) —
  // everyone else's pool entries have answers: null, so skip those columns
  // entirely rather than render a table full of "—".
  const showAnswers = entries.some((e) => e.answers !== null);
  // Skip the WOM columns entirely if nobody in the pool has stats (WOM
  // integration effectively unused for this bingo), same reasoning.
  const showWomStats = entries.some((e) => e.womStats !== null || statsRefreshing.has(e.signup.id));
  const showCa = entries.some((e) => e.caCurrent !== null || e.caPeak !== null || statsRefreshing.has(e.signup.id));
  // Clan standing columns only when tectonic-api knows at least one player.
  const showProfiles = entries.some((e) => e.tectonicProfile !== null);
  const hasPairs = pool.some((u) => u.entries.length > 1);
  // Leftovers wait until the main pool is empty (singles round) or are never
  // drafted (cut); the Draft button follows draftService.draftablePool.
  const hasLeftovers = pool.some((u) => u.leftover);
  const mainPoolEmpty = pool.every((u) => u.leftover);
  const leftoverTag = leftoverMode === "singles" ? "Singles round" : "Cut";
  const columnOptions = [
    { id: "discord", label: "Discord" },
    ...(showProfiles
      ? [
          { id: "tier", label: "Tier" },
          { id: "records", label: "Records" },
          { id: "podiums", label: "Podiums" },
          { id: "achievements", label: "Achievements" },
        ]
      : []),
    ...(showWomStats
      ? [
          { id: "ehb", label: "EHB" },
          { id: "ehp", label: "EHP" },
        ]
      : []),
    ...(showCa
      ? [
          { id: "caCurrent", label: "Current CA" },
          { id: "caPeak", label: "Peak CA" },
        ]
      : []),
    ...(showAnswers ? questions.map((q) => ({ id: q.id, label: q.prompt })) : []),
  ];

  const sorted = pool
    .map((u) => sortUnit(u, sort, ratingOf))
    .sort((a, b) => sort.order(compareSortValues(poolSortValue(a.entries[0], sort.key, ratingOf), poolSortValue(b.entries[0], sort.key, ratingOf))));

  if (pool.length === 0) return <p className="text-sm text-on-surface-subtle">No one left to draft.</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ColumnPicker columns={columnOptions} hidden={hiddenColumns} onHiddenChange={setHiddenColumns} />
      </div>
    <div className="overflow-x-auto">
      <table className="w-max min-w-full text-sm [&_td]:align-middle [&_th]:align-middle">
        <thead>
          <tr className="border-b border-outline">
            {hasPairs && <th className="pb-2 pr-2" />}
            {ratings && <SortHeader label="Rating" sortKey="rating" sort={sort} />}
            <SortHeader label="RSN" sortKey="rsn" sort={sort} />
            {shown("discord") && <SortHeader label="Discord" sortKey="discord" sort={sort} />}
            {hasLeftovers && <th className="pb-2 pr-4" />}
            {showProfiles && shown("tier") && <SortHeader label="Tier" sortKey="tier" sort={sort} />}
            {showProfiles && shown("records") && <SortHeader label="Records" sortKey="records" sort={sort} />}
            {showProfiles && shown("podiums") && <SortHeader label="Podiums" sortKey="podiums" sort={sort} />}
            {showProfiles && shown("achievements") && <th className="pb-2 pr-4" />}
            {showWomStats && shown("ehb") && <SortHeader label="EHB" sortKey="ehb" sort={sort} />}
            {showWomStats && shown("ehp") && <SortHeader label="EHP" sortKey="ehp" sort={sort} />}
            {showCa && shown("caCurrent") && <SortHeader label="Current CA" sortKey="caCurrent" sort={sort} />}
            {showCa && shown("caPeak") && <SortHeader label="Peak CA" sortKey="caPeak" sort={sort} />}
            {showAnswers && questions.filter((q) => shown(q.id)).map((q) => <SortHeader key={q.id} label={q.prompt} sortKey={q.id} sort={sort} />)}
            {canPick && <th className={`${STICKY_HEADER} pb-2`} />}
          </tr>
        </thead>
        {/* One tbody per unit: a pair's two rows share the group's Draft
            button and are marked by a link icon down the left edge. */}
        {sorted.map((unit) => {
          const isPair = unit.entries.length > 1;
          const draftable = !unit.leftover || (mainPoolEmpty && leftoverMode === "singles");
          return (
            <tbody key={unit.pairingId ?? unit.entries[0].signup.id} className={`border-t border-outline ${unit.leftover ? "text-on-surface-subtle" : ""}`}>
              {unit.entries.map((entry, i) => {
                const answerByQ = new Map((entry.answers ?? []).map((a) => [a.questionId, a.value]));
                return (
                  <tr key={entry.signup.id}>
                    {hasPairs && (
                      <td className="w-6 pr-2 align-middle text-on-surface-subtle">
                        {isPair && i === 0 && <LinkIcon size={14} aria-label="Duo pair" className="mt-1" />}
                      </td>
                    )}
                    {ratings && i === 0 && (
                      // Pairs are drafted together, so they carry one rating.
                      <td className="py-1 pr-4 align-middle" rowSpan={unit.entries.length}>
                        <RatingCell rating={ratings[entry.signup.id]} onChange={(r) => onRate(entry.signup.id, r)} />
                      </td>
                    )}
                    <td className={`whitespace-nowrap py-2 pr-4 font-medium ${unit.leftover ? "" : "text-on-surface"}`}>
                      <span className="inline-flex items-center gap-1">
                        <AccountTypeIcon accountType={entry.accountType} />
                        <PlayerName userId={entry.user.id}>{entry.signup.rsn}</PlayerName>
                      </span>
                    </td>
                    {shown("discord") && <td className="whitespace-nowrap py-2 pr-4 text-on-surface-muted">{discordName(entry.user)}</td>}
                    {hasLeftovers && <td className="py-2 pr-4 align-middle">{unit.leftover && i === 0 && <Badge tone="warn">{leftoverTag}</Badge>}</td>}
                    {showProfiles && <ProfileCells profile={entry.tectonicProfile} shown={shown} />}
                    {showWomStats && shown("ehb") && (
                      <td className="num whitespace-nowrap py-2 pr-4 text-on-surface-muted">
                        <WomCell stats={entry.womStats} field="ehb" loading={statsRefreshing.has(entry.signup.id)} />
                      </td>
                    )}
                    {showWomStats && shown("ehp") && (
                      <td className="num whitespace-nowrap py-2 pr-4 text-on-surface-muted">
                        <WomCell stats={entry.womStats} field="ehp" loading={statsRefreshing.has(entry.signup.id)} />
                      </td>
                    )}
                    {showCa && shown("caCurrent") && (
                      <td className="py-2 pr-4 text-on-surface-muted">
                        <CaCell stats={entry.caCurrent} loading={statsRefreshing.has(entry.signup.id)} />
                      </td>
                    )}
                    {showCa && shown("caPeak") && (
                      <td className="py-2 pr-4 text-on-surface-muted">
                        <CaCell stats={entry.caPeak} loading={statsRefreshing.has(entry.signup.id)} />
                      </td>
                    )}
                    {showAnswers &&
                      questions.filter((q) => shown(q.id)).map((q) => (
                        <td key={q.id} className="py-2 pr-4 text-on-surface-muted">
                          {formatSignupAnswer(q.type, answerByQ.get(q.id)) || "—"}
                        </td>
                      ))}
                    {canPick && i === 0 && (
                      <td className={`${STICKY_CELL} py-1 pl-3 text-right align-middle`} rowSpan={unit.entries.length}>
                        <Button size="sm" variant="primary" onPress={() => onPick(entry.user.id)} isDisabled={picking || !draftable}>
                          {isPair ? "Draft pair" : "Draft"}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
    </div>
  );
}

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

export function DraftRoom({ slug }: { slug: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const { data: shell } = useBingo(slug);
  const { data: state, error: stateError } = useDraftState(slug);
  const { data: questionsData } = useSignupQuestions(slug);
  const shuffleOrder = useShuffleDraftOrder(slug);
  const setOrder = useSetDraftOrder(slug);
  const startDraft = useStartDraft(slug);
  const makePick = useMakePick(slug);
  const setRating = useSetPickRating(slug);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);

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
  const canControlOrder = isAdmin && !scouting && state.picks.length === 0;
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

  async function handleRate(signupId: string, rating: PickRating) {
    setRateError(null);
    try {
      await setRating.mutateAsync({ signupId, rating });
    } catch (e: unknown) {
      setRateError(e instanceof Error ? e.message : "Failed to save that rating");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-6">
      {scouting ? (
        <Notice tone="info">
          Scouting. Signups are {shell.bingo.stage === "signup" ? "still open" : "closed"} — the draft starts once the mods move the bingo to the draft stage.
          {isLead && " Star and note players now; your team's ratings carry over into the draft."}
        </Notice>
      ) : !state.draftStarted ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
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
        </Card>
      ) : canControlOrder ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold text-on-surface">{revealing ? "Revealing pick order" : state.currentPick ? `${currentTeam?.name ?? "…"} is on the clock` : "Draft started"}</p>
            {state.currentPick && (
              <p className="num text-xs uppercase tracking-wide text-on-surface-subtle">
                {state.currentPick.singlesRound ? "Singles round" : `Round ${state.currentPick.round}`} · Pick {state.currentPick.pickNumber}
              </p>
            )}
            {orderError && <p className="mt-1 text-sm text-danger">{orderError}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onPress={handleShuffle} isDisabled={busy}>
              {shuffleOrder.isPending ? "Shuffling…" : "Shuffle pick order"}
            </Button>
            <Button onPress={() => { setOrderError(null); setOrderOpen(true); }} isDisabled={busy}>
              Pick order
            </Button>
            <Button variant="primary" isDisabled>
              Start draft
            </Button>
          </div>
        </Card>
      ) : state.currentPick ? (
        <Card className="p-4">
          <p className="num text-xs uppercase tracking-wide text-on-surface-subtle">
            {state.currentPick.singlesRound ? "Singles round" : `Round ${state.currentPick.round}`} · Pick {state.currentPick.pickNumber}
          </p>
          <p className="text-lg font-semibold text-on-surface">{currentTeam?.name ?? "…"} is on the clock</p>
        </Card>
      ) : revealing ? (
        <Notice tone="info">Revealing pick order.</Notice>
      ) : (
        <Notice tone="ok">
          Draft complete. {isMod ? "Advance to the reveal stage from the mod panel when you're ready." : "The board is revealed next."}
          {poolCount > 0 && (
            <>
              {" "}
              <span className="num">{poolCount}</span> leftover signup{poolCount === 1 ? " was" : "s were"} not drafted.
            </>
          )}
        </Notice>
      )}

      {isMyTurn && <Notice tone="ok">It's your turn to pick.</Notice>}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-on-surface" style={HEADING_FONT}>
          Teams
        </h3>
        {/* grid-flow-col + a minimum column width, in a scrollable row —
            handles a handful of teams (spread to fill width) and a large
            number of teams (scrolls instead of squeezing RSNs unreadable). */}
        <div className="overflow-x-auto">
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
                />
              </motion.div>
            ))}
          </div>
        </div>
        {state.teams.length === 0 && <p className="text-sm text-on-surface-subtle">No teams yet.</p>}
      </section>

      <PickOrderDialog
        isOpen={orderOpen}
        onClose={() => setOrderOpen(false)}
        teams={state.teams}
        onSave={handleSaveOrder}
        saving={setOrder.isPending}
        error={orderError}
      />

      <section>
        <h3 className="mb-2 text-sm font-semibold text-on-surface" style={HEADING_FONT}>
          Available players <span className="num font-normal text-on-surface-subtle">({poolCount})</span>
        </h3>
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
        <Card className="p-4">
          <PoolTable
            pool={state.pool}
            questions={questions}
            ratings={isLead ? state.ratings : null}
            onRate={handleRate}
            canPick={canAct}
            onPick={handlePick}
            picking={makePick.isPending}
            leftoverMode={shell.bingo.leftoverMode}
          />
        </Card>
      </section>
    </div>
  );
}

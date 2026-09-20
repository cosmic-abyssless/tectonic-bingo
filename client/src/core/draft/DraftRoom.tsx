import { useState, type CSSProperties } from "react";
import type { DraftPoolEntry, DraftUnit, LeftoverMode, PickRating, SignupQuestion, TectonicProfile } from "@bingo/shared";
import { CaCell, WomCell } from "../signup/caStats";
import { useStatsRefreshingSignupIds } from "../../context/WebSocketContext";
import { useAuth } from "../../context/AuthContext";
import { useBingo, useDraftState, useMakePick, useSetPickRating, useSignupQuestions, useStartDraft } from "../../api/queries";
import { displayName } from "../ui/user";
import { Button } from "../ui/Button";
import { Badge, Card, Notice } from "../ui/Card";
import { ColumnPicker } from "../ui/ColumnPicker";
import { useHiddenColumns } from "../ui/hiddenColumns";
import { LinkIcon } from "../ui/icons";
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
  if (key === "discord") return displayName(entry.user).toLowerCase();
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
  const empty = <td className="py-2 pr-4 text-on-surface-subtle">—</td>;
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
        <td className="py-2 pr-4">
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
      <table className="w-full text-sm">
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
            {canPick && <th className="pb-2" />}
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
                      <AccountTypeIcon accountType={entry.accountType} /> <PlayerName userId={entry.user.id}>{entry.signup.rsn}</PlayerName>
                    </td>
                    {shown("discord") && <td className="whitespace-nowrap py-2 pr-4 text-on-surface-muted">{displayName(entry.user)}</td>}
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
                          {answerByQ.get(q.id) ?? "—"}
                        </td>
                      ))}
                    {canPick && i === 0 && (
                      <td className="py-1 text-right align-middle" rowSpan={unit.entries.length}>
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

export function DraftRoom({ slug }: { slug: string }) {
  const { user } = useAuth();
  const { data: shell } = useBingo(slug);
  const { data: state, error: stateError } = useDraftState(slug);
  const { data: questionsData } = useSignupQuestions(slug);
  const startDraft = useStartDraft(slug);
  const makePick = useMakePick(slug);
  const setRating = useSetPickRating(slug);
  const [startError, setStartError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  // Which pool entry's profile dialog is open. Tracked by signup id so the
  // dialog follows live refetches instead of showing a stale snapshot.

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

  async function handleStart() {
    setStartError(null);
    try {
      await startDraft.mutateAsync();
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : "Failed to start the draft");
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
              {state.teams.length} team{state.teams.length === 1 ? "" : "s"} ready.{" "}
              {state.teams.length < 2 ? "Create at least 2 teams from the mod panel first." : "Starting randomizes the pick order."}
            </p>
            {startError && <p className="mt-1 text-sm text-danger">{startError}</p>}
          </div>
          {isMod && (
            <Button variant="primary" onPress={handleStart} isDisabled={state.teams.length < 2 || startDraft.isPending}>
              {startDraft.isPending ? "Starting…" : "Start draft"}
            </Button>
          )}
        </Card>
      ) : state.currentPick ? (
        <Card className="p-4">
          <p className="num text-xs uppercase tracking-wide text-on-surface-subtle">
            {state.currentPick.singlesRound ? "Singles round" : `Round ${state.currentPick.round}`} · Pick {state.currentPick.pickNumber}
          </p>
          <p className="text-lg font-semibold text-on-surface">{currentTeam?.name ?? "…"} is on the clock</p>
        </Card>
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
              <TeamRoster key={team.id} team={team} picks={state.picks.filter((p) => p.teamId === team.id)} isCurrent={currentTeam?.id === team.id} />
            ))}
          </div>
        </div>
        {state.teams.length === 0 && <p className="text-sm text-on-surface-subtle">No teams yet.</p>}
      </section>

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

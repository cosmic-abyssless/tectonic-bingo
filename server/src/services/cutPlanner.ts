// The Cut review's planner (CONTEXT.md "Cut review"): a pure function over the draft pool that proposes the
// fewest-cut-players plan, plus a scorer for an admin-edited change list. No DB access here — cutReviewService.ts
// builds the input from the real pool and applies the resulting CutChanges through the existing pairing/team
// operations. Every candidate arrangement is scored by handing it to the real markCuts (draftService.ts), which
// stays the one source of truth for who a given arrangement cuts.
import { CutMode, TIME_ZONE_REGIONS, type CutChange, type TimeZoneRegion } from "@bingo/shared";
import { markCuts, type DraftPoolEntry, type DraftUnit } from "./draftService";
import { ServiceError } from "./errors";

/** One player inside a planner unit — a single has one, a pair has two. */
export interface CutPlannerEntry {
  userId: string;
  signedUpAt: number; // ms epoch, matches signup.createdAt — see markCuts' newest-first tie-break
  insertionRank: number; // true DB insertion order; breaks a signedUpAt tie the same way markCuts does
  timezoneRegion: TimeZoneRegion | null; // null = no timezone set
}

/**
 * One unit of the draft pool: a single (one entry) or an accepted pair (two), same as draftService's DraftUnit but
 * carrying only what the planner needs to reason about, so it can be constructed in a test with no DB at all.
 */
export interface CutPlannerUnit {
  pairingId: string | null; // null for a single
  // A pair a Captain or co-captain belongs to. The real draft pool never contains one (they're already on a team
  // before the Draft — see draftService.groupIntoUnits), but the planner still respects the flag defensively: such
  // a pair is never proposed for splitting, matching pairingService.unpair's own refusal.
  isCaptainPair: boolean;
  entries: CutPlannerEntry[];
}

/**
 * A Team as it stands before the Draft: its Captain and co-captain, who are on the Team rather than in the pool.
 * Removing the Team puts them back in the pool (as a pair, when they're one); adding a Team takes its Captain (and
 * their partner, as co-captain) out of it — so a Team change moves players as well as changing the Team count.
 */
export interface CutPlannerTeam {
  teamId: string;
  members: CutPlannerEntry[];
  pairingId: string | null; // set when the two members are an accepted pair
}

export interface CutPlannerInput {
  units: CutPlannerUnit[]; // the undrafted pool, as things stand
  cutMode: CutMode;
  teamCount: number; // current Team count
  drafted: { pairs: number; singles: number }; // already drafted (see markCuts) — always {0,0} pre-Draft
  isSolo: boolean; // signupMode === "solo": there is no such thing as pairing or splitting
  teams?: CutPlannerTeam[]; // the current Teams' members (Captains); omitted = none known, e.g. in a unit test
}

export interface CutPlan {
  changes: CutChange[];
  cutPlayers: number; // players cut once every change in `changes` is applied
  cutPlayersNow: number; // players cut as things stand, before any change
}

// Minimum average Team size (total players ÷ Teams) a Team-count change must keep, growing with the player count.
const TIER_BREAKS: [maxPlayers: number, minTeamSize: number][] = [
  [19, 3],
  [49, 4],
  [Infinity, 5],
];
export function minTeamSize(totalPlayers: number): number {
  return TIER_BREAKS.find(([max]) => totalPlayers <= max)?.[1] ?? 5;
}

const isPair = (u: CutPlannerUnit) => u.entries.length > 1;
// Everyone: the pool, whoever's been drafted, and the Teams' own members (their Captains) — what "average Team size"
// is measured against.
const totalPlayersOf = (input: CutPlannerInput): number =>
  input.drafted.pairs * 2 +
  input.drafted.singles +
  input.units.reduce((n, u) => n + u.entries.length, 0) +
  (input.teams ?? []).reduce((n, t) => n + t.members.length, 0);

// ---------------------------------------------------------------------------
// Scoring — builds the real DraftUnit shape markCuts expects and asks it who's cut, so the arithmetic never drifts
// from the actual draft. The fabricated `signup`/`user` rows only need the two fields markCuts itself reads
// (signup.id, signup.createdAt); everything else is never touched.
// ---------------------------------------------------------------------------

function toDraftUnit(u: CutPlannerUnit): DraftUnit {
  return {
    pairingId: u.pairingId,
    cut: false,
    entries: u.entries.map(
      (e): DraftPoolEntry => ({
        signup: { id: e.userId, createdAt: new Date(e.signedUpAt) } as unknown as DraftPoolEntry["signup"],
        user: {} as unknown as DraftPoolEntry["user"],
        answers: null,
      }),
    ),
  };
}

function scoreArrangement(units: CutPlannerUnit[], cutMode: CutMode, teamCount: number, drafted: { pairs: number; singles: number }): number {
  const draftUnits = units.map(toDraftUnit);
  const insertionOrder = new Map(units.flatMap((u) => u.entries.map((e) => [e.userId, e.insertionRank] as const)));
  markCuts(draftUnits, cutMode, teamCount, drafted, insertionOrder);
  return draftUnits.filter((u) => u.cut).reduce((n, u) => n + u.entries.length, 0);
}

// ---------------------------------------------------------------------------
// Team changes move players: an added Team's Captain (and their partner) leave the pool, a removed Team's members
// rejoin it. With the Captain / Team already picked (an admin-edited list) that's exact; a plan never picks, so
// then every way it could go is scored and the best kept — the admin's actual pick is scored exactly once made.
// ---------------------------------------------------------------------------

type TeamChange = { kind: "addTeam"; captainUserId?: string } | { kind: "removeTeam"; teamId?: string };

function poolsAfterTeamChange(units: CutPlannerUnit[], change: TeamChange | null, teams: CutPlannerTeam[]): CutPlannerUnit[][] {
  if (!change) return [units];
  if (change.kind === "addTeam") {
    if (change.captainUserId) {
      const unit = units.find((u) => u.entries.some((e) => e.userId === change.captainUserId));
      if (!unit) throw new ServiceError(400, "The new Team's Captain has to be a player who isn't on a Team yet");
      return [units.filter((u) => u !== unit)];
    }
    // Which single (or which pair) doesn't change how many are cut — only whether it's a single or a pair does.
    const options = [units.find((u) => !isPair(u)), units.find(isPair)].filter((u): u is CutPlannerUnit => !!u);
    return options.length ? options.map((leaving) => units.filter((u) => u !== leaving)) : [units];
  }
  const rejoin = (t: CutPlannerTeam): CutPlannerUnit[] =>
    t.pairingId && t.members.length === 2
      ? [{ pairingId: t.pairingId, isCaptainPair: false, entries: t.members }]
      : t.members.map((m) => ({ pairingId: null, isCaptainPair: false, entries: [m] }));
  if (change.teamId) {
    const team = teams.find((t) => t.teamId === change.teamId);
    if (!team) throw new ServiceError(400, "That Team isn't in this bingo");
    return [[...units, ...rejoin(team)]];
  }
  return teams.length ? teams.map((t) => [...units, ...rejoin(t)]) : [units];
}

/** Players cut after `change` (if any) at `teamCount` Teams — the best case when the change's pick is still open. */
function scoreWithTeamChange(
  units: CutPlannerUnit[],
  change: TeamChange | null,
  teams: CutPlannerTeam[],
  cutMode: CutMode,
  teamCount: number,
  drafted: { pairs: number; singles: number },
): number {
  return Math.min(...poolsAfterTeamChange(units, change, teams).map((pool) => scoreArrangement(pool, cutMode, teamCount, drafted)));
}

// ---------------------------------------------------------------------------
// Preference ordering — which singles to pair, which pairs to split, when the planner is free to choose.
// ---------------------------------------------------------------------------

const REGION_ORDER: (TimeZoneRegion | "unset")[] = [...TIME_ZONE_REGIONS.map((r) => r.key), "unset"];
const regionOf = (u: CutPlannerUnit): TimeZoneRegion | "unset" => u.entries[0]!.timezoneRegion ?? "unset";
const byEarliest = (a: CutPlannerUnit, b: CutPlannerUnit) => a.entries[0]!.signedUpAt - b.entries[0]!.signedUpAt || a.entries[0]!.insertionRank - b.entries[0]!.insertionRank;

/**
 * Every possible single+single pairing, most preferred first: same timezone region (grouped, earliest signups
 * paired together first, region groups in the Timezone filter's own order), then whatever's left over — earliest
 * signed up first, regardless of region. Disjoint by construction, so the first `k` are always a valid set of k
 * pairings.
 */
function orderedPairingCandidates(singles: CutPlannerUnit[]): [CutPlannerUnit, CutPlannerUnit][] {
  const byRegion = new Map<string, CutPlannerUnit[]>();
  for (const s of singles) byRegion.set(regionOf(s), [...(byRegion.get(regionOf(s)) ?? []), s]);

  const candidates: [CutPlannerUnit, CutPlannerUnit][] = [];
  const leftovers: CutPlannerUnit[] = [];
  for (const key of REGION_ORDER) {
    const group = [...(byRegion.get(key) ?? [])].sort(byEarliest);
    for (let i = 0; i + 1 < group.length; i += 2) candidates.push([group[i]!, group[i + 1]!]);
    if (group.length % 2 === 1) leftovers.push(group[group.length - 1]!);
  }
  leftovers.sort(byEarliest);
  for (let i = 0; i + 1 < leftovers.length; i += 2) candidates.push([leftovers[i]!, leftovers[i + 1]!]);
  return candidates;
}

/** Every eligible pair to split (never a Captain's), newest first — a pair's age is its later signup, same as markCuts. */
function orderedSplitCandidates(pairs: CutPlannerUnit[]): CutPlannerUnit[] {
  const ageOf = (p: CutPlannerUnit) => Math.max(...p.entries.map((e) => e.signedUpAt));
  const rankOf = (p: CutPlannerUnit) => Math.max(...p.entries.map((e) => e.insertionRank));
  return pairs.filter((p) => !p.isCaptainPair).sort((a, b) => ageOf(b) - ageOf(a) || rankOf(b) - rankOf(a));
}

function applyProvisional(units: CutPlannerUnit[], pairPicks: [CutPlannerUnit, CutPlannerUnit][], splitPicks: CutPlannerUnit[]): CutPlannerUnit[] {
  const paired = new Set(pairPicks.flatMap(([a, b]) => [a, b]));
  const split = new Set(splitPicks);
  const kept = units.filter((u) => !paired.has(u) && !split.has(u));
  const newPairs: CutPlannerUnit[] = pairPicks.map(([a, b]) => ({ pairingId: null, isCaptainPair: false, entries: [...a.entries, ...b.entries] }));
  const newSingles: CutPlannerUnit[] = splitPicks.flatMap((p) => p.entries.map((e) => ({ pairingId: null, isCaptainPair: false, entries: [e] })));
  return [...kept, ...newPairs, ...newSingles];
}

// ---------------------------------------------------------------------------
// planCutChanges — searches (Team-count delta, how many pairings, how many splits), scoring every combination with
// the real markCuts, and keeps the best by: fewest cut players, then fewest changes, then preferring pairing over
// splitting over a Team change (CONTEXT.md "Cut review"). Tractable because k and m only range over how many
// pairings/splits are even possible (small integers), not over which subset of players — which is fixed by the
// preference order above once a count is chosen.
// ---------------------------------------------------------------------------

function teamCountCandidates(teamCount: number, totalPlayers: number): number[] {
  const candidates = [teamCount];
  for (const delta of [-1, 1] as const) {
    const tc = teamCount + delta;
    if (tc < 2 || totalPlayers === 0) continue;
    if (totalPlayers / tc < minTeamSize(totalPlayers)) continue;
    candidates.push(tc);
  }
  return candidates;
}

export function planCutChanges(input: CutPlannerInput): CutPlan {
  const { units, cutMode, teamCount, drafted, isSolo } = input;
  const cutPlayersNow = scoreArrangement(units, cutMode, teamCount, drafted);
  if (cutMode === "none") return { changes: [], cutPlayers: 0, cutPlayersNow: 0 };

  const totalPlayers = totalPlayersOf(input);
  const singles = units.filter((u) => !isPair(u));
  const pairs = units.filter(isPair);

  const pairingCandidates = isSolo ? [] : orderedPairingCandidates(singles);
  const splitCandidates = isSolo || cutMode === "pairs_only" ? [] : orderedSplitCandidates(pairs);
  const maxK = pairingCandidates.length;
  const maxM = splitCandidates.length;
  const teamCandidates = teamCountCandidates(teamCount, totalPlayers);

  interface Candidate {
    teamCount: number;
    k: number;
    m: number;
    cutPlayers: number;
  }
  // badness: how much a plan leans on the less-preferred change types (pairing is free, splitting costs 1 per
  // split, a Team change costs 2) — only breaks a tie once cutPlayers and the change count are already equal.
  const badness = (c: Candidate) => c.m + (c.teamCount !== teamCount ? 2 : 0);
  const changeCount = (c: Candidate) => c.k + c.m + (c.teamCount !== teamCount ? 1 : 0);
  const better = (a: Candidate, b: Candidate): boolean => {
    if (a.cutPlayers !== b.cutPlayers) return a.cutPlayers < b.cutPlayers;
    if (changeCount(a) !== changeCount(b)) return changeCount(a) < changeCount(b);
    if (badness(a) !== badness(b)) return badness(a) < badness(b);
    if (a.teamCount !== b.teamCount) return a.teamCount < b.teamCount;
    if (a.k !== b.k) return a.k < b.k;
    return a.m < b.m;
  };

  let best: Candidate = { teamCount, k: 0, m: 0, cutPlayers: cutPlayersNow };
  for (const tc of teamCandidates) {
    for (let k = 0; k <= maxK; k++) {
      for (let m = 0; m <= maxM; m++) {
        if (tc === teamCount && k === 0 && m === 0) continue; // already `best`'s starting point
        const provisional = applyProvisional(units, pairingCandidates.slice(0, k), splitCandidates.slice(0, m));
        const teamChange: TeamChange | null = tc > teamCount ? { kind: "addTeam" } : tc < teamCount ? { kind: "removeTeam" } : null;
        const cutPlayers = scoreWithTeamChange(provisional, teamChange, input.teams ?? [], cutMode, tc, drafted);
        const candidate: Candidate = { teamCount: tc, k, m, cutPlayers };
        if (better(candidate, best)) best = candidate;
      }
    }
  }

  const changes: CutChange[] = [
    ...pairingCandidates.slice(0, best.k).map(([a, b]): CutChange => ({ kind: "pair", userIds: [a.entries[0]!.userId, b.entries[0]!.userId] })),
    ...splitCandidates.slice(0, best.m).map((p): CutChange => ({ kind: "split", pairingId: p.pairingId! })),
    ...(best.teamCount > teamCount ? [{ kind: "addTeam" } as const] : []),
    ...(best.teamCount < teamCount ? [{ kind: "removeTeam" } as const] : []),
  ];

  return { changes, cutPlayers: best.cutPlayers, cutPlayersNow };
}

// ---------------------------------------------------------------------------
// Scoring an arbitrary (e.g. admin-edited) change list against the current pool.
// ---------------------------------------------------------------------------

/**
 * Applies `changes` to the pool in order, validating each against the roster as it stands after the ones before
 * it — so a plan that splits a pair and then pairs one of its halves with someone else still resolves. Throws
 * ServiceError for a change that doesn't fit: an unknown or already-spoken-for signup/pairing, a Captain's pair,
 * more than one Team change, or a Team change outside ±1 / the size tiers.
 */
export function resolveChanges(input: CutPlannerInput, changes: CutChange[]): { units: CutPlannerUnit[]; teamCount: number; teamChange: TeamChange | null } {
  let singles = input.units.filter((u) => !isPair(u));
  let pairs = input.units.filter(isPair);
  let teamDelta = 0;
  let teamChange: TeamChange | null = null;

  for (const change of changes) {
    if (change.kind === "pair") {
      const [aId, bId] = change.userIds;
      if (aId === bId) throw new ServiceError(400, "Pick two different players to pair");
      const a = singles.find((u) => u.entries[0]!.userId === aId);
      const b = singles.find((u) => u.entries[0]!.userId === bId);
      if (!a || !b) throw new ServiceError(400, "That pairing needs two players who are currently unpaired");
      singles = singles.filter((u) => u !== a && u !== b);
      pairs = [...pairs, { pairingId: null, isCaptainPair: false, entries: [...a.entries, ...b.entries] }];
    } else if (change.kind === "split") {
      const pair = pairs.find((p) => p.pairingId === change.pairingId);
      if (!pair) throw new ServiceError(400, "That pairing isn't currently accepted");
      if (pair.isCaptainPair) throw new ServiceError(409, "That pair leads a Team and can't be split");
      pairs = pairs.filter((p) => p !== pair);
      singles = [...singles, ...pair.entries.map((e): CutPlannerUnit => ({ pairingId: null, isCaptainPair: false, entries: [e] }))];
    } else {
      if (teamDelta !== 0) throw new ServiceError(400, "A plan can change the Team count by at most one Team");
      teamDelta = change.kind === "addTeam" ? 1 : -1;
      teamChange = change;
    }
  }

  const teamCount = input.teamCount + teamDelta;
  if (teamDelta !== 0) {
    if (teamCount < 2) throw new ServiceError(400, "A bingo needs at least 2 Teams");
    const totalPlayers = totalPlayersOf(input);
    if (totalPlayers > 0 && totalPlayers / teamCount < minTeamSize(totalPlayers)) {
      throw new ServiceError(400, `That would leave fewer than ${minTeamSize(totalPlayers)} players per Team on average`);
    }
  }

  return { units: [...singles, ...pairs], teamCount, teamChange };
}

/** How many players `changes` would leave cut, validated against the current pool (see resolveChanges). */
export function scoreChanges(input: CutPlannerInput, changes: CutChange[]): { cutPlayers: number; cutPlayersNow: number } {
  const cutPlayersNow = scoreArrangement(input.units, input.cutMode, input.teamCount, input.drafted);
  if (input.cutMode === "none") return { cutPlayers: 0, cutPlayersNow: 0 };
  const { units, teamCount, teamChange } = resolveChanges(input, changes);
  const cutPlayers = scoreWithTeamChange(units, teamChange, input.teams ?? [], input.cutMode, teamCount, input.drafted);
  return { cutPlayers, cutPlayersNow };
}

// Optional per-bingo integration: when a mod turns it on in the settings
// panel (bingos.womEnabled) and supplies a WOM group id + group verification
// code, a WOM group competition is created for the bingo's teams once the
// draft finishes, and kept in sync after that (syncWomCompetition): the
// bingo's name, its start and end dates, and every team's name and members.
//
// WOM lets a competition linked to a group be edited with that same group's
// verification code (https://docs.wiseoldman.net/api/competitions/competition-endpoints)
// instead of the competition's own one-time verification code, so we never
// need to persist a second secret — only the group's, already required to
// create the competition in the first place.
//
// Both entry points (syncWomCompetitionAfterDraft, syncWomCompetition) are
// called fire-and-forget from the route layer, same convention as
// playerStatsService.fetchAndPersistPlayerStats: never throws, and any
// failure is persisted onto bingos.womSyncError for the settings panel to
// surface rather than bubbling up and breaking the change that triggered it.
import { now as clockNow } from "../clock";
import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos, signups, teamMembers, teams } from "../db/schema";
import { audit } from "../audit/record";
import { USER_AGENT } from "../config";
import { log } from "../log";
import { TESTDATA_PREFIX } from "./devTestDataService";
import { effectiveStartsAt } from "./bingoStart";

type Db = BetterSQLite3Database<typeof schema>;
type FetchLike = typeof fetch;

const WOM_BASE_URL = "https://api.wiseoldman.net/v2";
const WOM_USER_AGENT = `${USER_AGENT} WOM competitions`;

export interface WomCompetitionTeamInput {
  name: string;
  participants: string[];
}

export interface CreateCompetitionParams {
  title: string;
  metric?: string;
  startsAt: Date;
  endsAt: Date;
  groupId: string;
  groupVerificationCode: string;
  teams: WomCompetitionTeamInput[];
}

// Only the fields given are changed (WOM's edit leaves the rest alone); `teams` replaces every team.
export interface EditCompetitionParams {
  competitionId: number;
  groupVerificationCode: string;
  title?: string;
  startsAt?: Date;
  endsAt?: Date;
  teams?: WomCompetitionTeamInput[];
}

/** What WOM has for a competition, as far as the sync compares it (read from the public GET). */
export interface WomCompetitionState {
  title: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  /** Team name -> its members' usernames, lowercased (how WOM stores them), sorted. */
  teams: Map<string, string[]>;
  /** WOM player id -> the name WOM has for them now (it follows an in-game rename), for players in the competition. */
  namesById: Map<string, string>;
}

/** WOM couldn't be reached, rejected the credentials, or returned a non-2xx. */
export class WomCompetitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WomCompetitionError";
  }
}

const ERROR_DETAIL_MAX_CHARS = 300;

// A non-2xx from WOM is usually its own small JSON {message}, but an
// intermediary (Cloudflare, a proxy) can instead return a full HTML error
// page — that's not useful detail for an admin, so drop it rather than
// dumping the whole page into a ServiceError message and the UI's error box.
function summarizeErrorBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed || /^<(!doctype|html)/i.test(trimmed)) return "";
  return trimmed.length > ERROR_DETAIL_MAX_CHARS ? `${trimmed.slice(0, ERROR_DETAIL_MAX_CHARS)}…` : trimmed;
}

export class WomCompetitionClient {
  constructor(
    private fetchImpl: FetchLike = fetch,
    private apiKey: string | null = process.env.WOM_API_KEY || null,
  ) {}

  async createCompetition(params: CreateCompetitionParams): Promise<{ id: number }> {
    const res = await this.request("/competitions", "POST", {
      title: params.title,
      metric: params.metric ?? "overall",
      startsAt: params.startsAt.toISOString(),
      endsAt: params.endsAt.toISOString(),
      groupId: Number(params.groupId),
      groupVerificationCode: params.groupVerificationCode,
      teams: params.teams,
    });
    const json = (await res.json()) as { competition?: { id?: number } };
    if (!json.competition?.id) throw new WomCompetitionError("WOM did not return a competition id");
    return { id: json.competition.id };
  }

  async editCompetition(params: EditCompetitionParams): Promise<void> {
    // Unlike POST /competitions (which takes `groupVerificationCode`), the
    // edit endpoint's field is `verificationCode` — it just also accepts the
    // host group's code there, not the competition's own one-time code
    // (https://docs.wiseoldman.net/api/competitions/competition-endpoints#edit-competition).
    // Sending `groupVerificationCode` here silently fails WOM's required-field
    // validation, so a team rename never actually updated the roster.
    await this.request(`/competitions/${params.competitionId}`, "PUT", {
      verificationCode: params.groupVerificationCode,
      ...(params.title !== undefined && { title: params.title }),
      ...(params.startsAt && { startsAt: params.startsAt.toISOString() }),
      ...(params.endsAt && { endsAt: params.endsAt.toISOString() }),
      ...(params.teams && { teams: params.teams }),
    });
  }

  /** The competition's title, dates and teams as WOM has them, to compare with the bingo's before an edit. */
  async getCompetitionState(competitionId: number): Promise<WomCompetitionState> {
    const raw = (await this.getCompetition(competitionId)) as {
      title?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
      participations?: { teamName?: unknown; player?: { id?: unknown; username?: unknown; displayName?: unknown } }[];
    };
    const date = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
    const teams = new Map<string, string[]>();
    const namesById = new Map<string, string>();
    for (const p of raw.participations ?? []) {
      const player = p.player;
      if (typeof p.teamName !== "string" || typeof player?.username !== "string") continue;
      teams.set(p.teamName, [...(teams.get(p.teamName) ?? []), player.username.toLowerCase()]);
      if (typeof player.id === "number") namesById.set(String(player.id), typeof player.displayName === "string" ? player.displayName : player.username);
    }
    for (const [name, members] of teams) teams.set(name, members.sort());
    return { title: typeof raw.title === "string" ? raw.title : null, startsAt: date(raw.startsAt), endsAt: date(raw.endsAt), teams, namesById };
  }

  /** Full competition details (title, dates, and every participant's progress) — a public read, no verification code needed. */
  async getCompetition(competitionId: number): Promise<unknown> {
    const res = await this.request(`/competitions/${competitionId}`, "GET");
    return res.json();
  }

  private async request(path: string, method: string, body?: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${WOM_BASE_URL}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          "User-Agent": WOM_USER_AGENT,
          ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new WomCompetitionError(`${method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const detail = summarizeErrorBody(await res.text().catch(() => ""));
      throw new WomCompetitionError(`${method} ${path}: HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
    }
    return res;
  }
}

let _client: WomCompetitionClient | undefined;
export function getWomCompetitionClient(): WomCompetitionClient {
  if (!_client) _client = new WomCompetitionClient();
  return _client;
}

type Bingo = typeof bingos.$inferSelect;

interface WomIntegrationConfig {
  groupId: string;
  groupVerificationCode: string;
}

/** Null unless the integration is turned on and both credentials are set. */
function getWomIntegrationConfig(bingo: Bingo): WomIntegrationConfig | null {
  if (!bingo.womEnabled || !bingo.womGroupId || !bingo.womGroupVerificationCode) return null;
  return { groupId: bingo.womGroupId, groupVerificationCode: bingo.womGroupVerificationCode };
}

/** One WOM team entry per bingo team, named after the team with its current roster's RSNs. Teams with no RSN-bearing members are dropped — WOM rejects an empty team. */
// Each member by their signup's RSN, except a player the competition already has (matched by WOM id): WOM's name for
// them wins. WOM follows an in-game rename by itself, so our RSN can only be the same or out of date, and sending an
// out-of-date one would swap the player for their old name.
function getTeamRosters(db: Db, bingoId: string, womNamesById: Map<string, string> = new Map()): WomCompetitionTeamInput[] {
  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
  if (teamRows.length === 0) return [];
  const teamIds = teamRows.map((t) => t.id);
  const memberRows = db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all();
  const userIds = memberRows.map((m) => m.userId);
  const signupRows = userIds.length
    ? db.select({ userId: signups.userId, rsn: signups.rsn, womId: signups.womId }).from(signups).where(and(eq(signups.bingoId, bingoId), inArray(signups.userId, userIds))).all()
    : [];
  const rsnByUserId = new Map(signupRows.map((s) => [s.userId, (s.womId && womNamesById.get(s.womId)) || s.rsn]));
  return teamRows
    .map((team) => ({
      name: team.name,
      participants: memberRows.filter((m) => m.teamId === team.id).map((m) => rsnByUserId.get(m.userId)).filter((rsn): rsn is string => !!rsn),
    }))
    .filter((t) => t.participants.length > 0);
}

// E2E test hook, same convention as PLAYER_STATS_FETCH_DISABLED — skips the
// WOM network call entirely so tests never hit the live API.
function syncDisabled(): boolean {
  return process.env.WOM_COMPETITION_SYNC_DISABLED === "true";
}

// A test data bingo (the generator's, "testdata-" slug) is never synced: its made-up players and team names must not
// become a real WOM competition, whatever the server's settings.
function isTestData(bingo: { slug: string }): boolean {
  return bingo.slug.startsWith(TESTDATA_PREFIX);
}

/**
 * Fired once, right after a mod advances a bingo out of the draft stage.
 * No-ops when the integration isn't configured or a competition already
 * exists for this bingo (a re-advance shouldn't create a second one).
 */
export async function syncWomCompetitionAfterDraft(db: Db, bingoId: string, client: WomCompetitionClient = getWomCompetitionClient()): Promise<void> {
  if (syncDisabled()) return;
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo || bingo.womCompetitionId || isTestData(bingo)) return;
  const config = getWomIntegrationConfig(bingo);
  if (!config) return;

  const rosters = getTeamRosters(db, bingoId);
  if (rosters.length === 0) return;

  try {
    const startsAt = bingo.startsAt ?? clockNow();
    // WOM requires endsAt > startsAt; fall back to two weeks out when the
    // bingo has no end date scheduled yet.
    const endsAt = bingo.endsAt && bingo.endsAt > startsAt ? bingo.endsAt : new Date(startsAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    const { id } = await client.createCompetition({
      title: bingo.name,
      startsAt,
      endsAt,
      groupId: config.groupId,
      groupVerificationCode: config.groupVerificationCode,
      teams: rosters,
    });
    db.update(bingos).set({ womCompetitionId: id, womSyncError: null }).where(eq(bingos.id, bingoId)).run();
    audit(db, {
      action: "wom.competition_created",
      bingoId,
      entity: { type: "bingo", id: bingoId, label: bingo.name },
      details: { competitionId: id },
      actor: "system",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("wom competition create failed", { bingoId, err: message });
    db.update(bingos).set({ womSyncError: message }).where(eq(bingos.id, bingoId)).run();
    audit(db, {
      action: "wom.sync_failed",
      bingoId,
      entity: { type: "bingo", id: bingoId, label: bingo.name },
      details: { operation: "create", message },
      actor: "system",
    });
  }
}

/** The same teams and members, whatever the order (WOM keeps usernames lowercased). */
function sameTeams(ours: WomCompetitionTeamInput[], theirs: Map<string, string[]>): boolean {
  if (ours.length !== theirs.size) return false;
  return ours.every((t) => {
    const members = theirs.get(t.name);
    const mine = t.participants.map((p) => p.toLowerCase()).sort();
    return !!members && members.length === mine.length && members.every((m, i) => m === mine[i]);
  });
}

/**
 * Brings the bingo's WOM competition up to date: its title (the bingo's name), start and end dates, and teams (every
 * team's name and members). Fired after anything that changes one of those: the settings (name, dates), putting the
 * bingo live (with no start date set, that's when it starts), a team created, renamed or deleted, a member added or
 * removed. (Not a player's in-game rename: WOM follows that itself, and is where we learn of it.) Reads what WOM has first and sends only what differs, so an unchanged start
 * date is never sent to a competition that's already running. No-op until the competition exists.
 */
export async function syncWomCompetition(db: Db, bingoId: string, client: WomCompetitionClient = getWomCompetitionClient()): Promise<void> {
  if (syncDisabled()) return;
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo || !bingo.womCompetitionId || isTestData(bingo)) return;
  const config = getWomIntegrationConfig(bingo);
  if (!config) return;

  try {
    const current = await client.getCompetitionState(bingo.womCompetitionId);
    const changes: Omit<EditCompetitionParams, "competitionId" | "groupVerificationCode"> = {};
    if (bingo.name !== current.title) changes.title = bingo.name;
    // The bingo's dates, where it has them: with none, WOM keeps what it was created with (the draft's end, and two
    // weeks on). WOM needs the end after the start.
    const startsAt = effectiveStartsAt(db, bingo) ?? current.startsAt;
    const endsAt = bingo.endsAt ?? current.endsAt;
    if (startsAt && endsAt && endsAt > startsAt) {
      if (startsAt.getTime() !== current.startsAt?.getTime()) changes.startsAt = startsAt;
      if (endsAt.getTime() !== current.endsAt?.getTime()) changes.endsAt = endsAt;
    }
    const rosters = getTeamRosters(db, bingoId, current.namesById);
    if (rosters.length > 0 && !sameTeams(rosters, current.teams)) changes.teams = rosters;

    const changed = Object.keys(changes) as (keyof typeof changes)[];
    if (changed.length === 0) {
      if (bingo.womSyncError) db.update(bingos).set({ womSyncError: null }).where(eq(bingos.id, bingoId)).run();
      return;
    }
    await client.editCompetition({ competitionId: bingo.womCompetitionId, groupVerificationCode: config.groupVerificationCode, ...changes });
    db.update(bingos).set({ womSyncError: null }).where(eq(bingos.id, bingoId)).run();
    audit(db, {
      action: "wom.roster_synced",
      bingoId,
      entity: { type: "bingo", id: bingoId, label: bingo.name },
      details: { changed },
      actor: "system",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("wom competition sync failed", { bingoId, err: message });
    db.update(bingos).set({ womSyncError: message }).where(eq(bingos.id, bingoId)).run();
    audit(db, {
      action: "wom.sync_failed",
      bingoId,
      entity: { type: "bingo", id: bingoId, label: bingo.name },
      details: { operation: "sync", message },
      actor: "system",
    });
  }
}

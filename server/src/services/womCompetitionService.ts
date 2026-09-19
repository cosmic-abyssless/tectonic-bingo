// Optional per-bingo integration: when a mod turns it on in the settings
// panel (bingos.womEnabled) and supplies a WOM group id + group verification
// code, a WOM group competition is created for the bingo's teams once the
// draft finishes, and kept in sync when a captain renames their team.
//
// WOM lets a competition linked to a group be edited with that same group's
// verification code (https://docs.wiseoldman.net/api/competitions/competition-endpoints)
// instead of the competition's own one-time verification code, so we never
// need to persist a second secret — only the group's, already required to
// create the competition in the first place.
//
// Both entry points (syncWomCompetitionAfterDraft, syncWomTeamRename) are
// called fire-and-forget from the route layer, same convention as
// playerStatsService.fetchAndPersistPlayerStats: never throws, and any
// failure is persisted onto bingos.womSyncError for the settings panel to
// surface rather than bubbling up and breaking the stage change or rename
// that triggered it.
import { now as clockNow } from "../clock";
import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { bingos, signups, teamMembers, teams } from "../db/schema";
import { audit } from "../audit/record";
import { USER_AGENT } from "../config";

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

export interface EditCompetitionParams {
  competitionId: number;
  groupVerificationCode: string;
  teams: WomCompetitionTeamInput[];
}

/** WOM couldn't be reached, rejected the credentials, or returned a non-2xx. */
export class WomCompetitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WomCompetitionError";
  }
}

export class WomCompetitionClient {
  constructor(private fetchImpl: FetchLike = fetch) {}

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
      teams: params.teams,
    });
  }

  private async request(path: string, method: string, body: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${WOM_BASE_URL}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "User-Agent": WOM_USER_AGENT },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new WomCompetitionError(`${method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
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
function getTeamRosters(db: Db, bingoId: string): WomCompetitionTeamInput[] {
  const teamRows = db.select().from(teams).where(eq(teams.bingoId, bingoId)).all();
  if (teamRows.length === 0) return [];
  const teamIds = teamRows.map((t) => t.id);
  const memberRows = db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId }).from(teamMembers).where(inArray(teamMembers.teamId, teamIds)).all();
  const userIds = memberRows.map((m) => m.userId);
  const signupRows = userIds.length
    ? db.select({ userId: signups.userId, rsn: signups.rsn }).from(signups).where(and(eq(signups.bingoId, bingoId), inArray(signups.userId, userIds))).all()
    : [];
  const rsnByUserId = new Map(signupRows.map((s) => [s.userId, s.rsn]));
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

/**
 * Fired once, right after a mod advances a bingo out of the draft stage.
 * No-ops when the integration isn't configured or a competition already
 * exists for this bingo (a re-advance shouldn't create a second one).
 */
export async function syncWomCompetitionAfterDraft(db: Db, bingoId: string, client: WomCompetitionClient = getWomCompetitionClient()): Promise<void> {
  if (syncDisabled()) return;
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo || bingo.womCompetitionId) return;
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
    console.warn(`[wom-competition] failed to create competition for bingo ${bingoId}`, message);
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

/**
 * Fired after a team rename so the WOM competition's roster stays in sync.
 * No-op unless a competition has already been created for this bingo.
 */
export async function syncWomTeamRename(db: Db, bingoId: string, client: WomCompetitionClient = getWomCompetitionClient()): Promise<void> {
  if (syncDisabled()) return;
  const bingo = db.select().from(bingos).where(eq(bingos.id, bingoId)).get();
  if (!bingo || !bingo.womCompetitionId) return;
  const config = getWomIntegrationConfig(bingo);
  if (!config) return;

  try {
    const rosters = getTeamRosters(db, bingoId);
    await client.editCompetition({ competitionId: bingo.womCompetitionId, groupVerificationCode: config.groupVerificationCode, teams: rosters });
    db.update(bingos).set({ womSyncError: null }).where(eq(bingos.id, bingoId)).run();
    audit(db, {
      action: "wom.roster_synced",
      bingoId,
      entity: { type: "bingo", id: bingoId, label: bingo.name },
      details: {},
      actor: "system",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[wom-competition] failed to sync team rename for bingo ${bingoId}`, message);
    db.update(bingos).set({ womSyncError: message }).where(eq(bingos.id, bingoId)).run();
    audit(db, {
      action: "wom.sync_failed",
      bingoId,
      entity: { type: "bingo", id: bingoId, label: bingo.name },
      details: { operation: "rename", message },
      actor: "system",
    });
  }
}

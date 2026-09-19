// Read-side of the audit log: turns raw audit_log rows into the shared
// AuditEntry shape (label rendered, actor/team resolved) with keyset
// pagination. See docs/audit-log-plan.md §"Read API" / "Visibility model".
import { and, desc, eq, gte, inArray, isNull, like, lt, lte, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { actionsInCategory, AUDIT_ACTIONS, condenseAuditEntries, renderAuditLabel, type AuditAction, type AuditCategory, type AuditEntry, type AuditLogFilters, type AuditLogResponse, type AuditVisibility } from "@bingo/shared";
import * as schema from "../db/schema";
import { auditLog, teams, users } from "../db/schema";

type Db = BetterSQLite3Database<typeof schema>;

const MINIMAL_USER_COLS = {
  id: users.id,
  discordUsername: users.discordUsername,
  discordGlobalName: users.discordGlobalName,
  discordGuildNick: users.discordGuildNick,
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type AuditLogRow = typeof auditLog.$inferSelect;

function toAuditEntries(db: Db, rows: AuditLogRow[]): AuditEntry[] {
  const userIds = [...new Set(rows.flatMap((r) => [r.actorUserId, r.onBehalfOfUserId]).filter((id): id is string => !!id))];
  const teamIds = [...new Set(rows.map((r) => r.teamId).filter((id): id is string => !!id))];

  const userById = new Map(userIds.length ? db.select(MINIMAL_USER_COLS).from(users).where(inArray(users.id, userIds)).all().map((u) => [u.id, u]) : []);
  const teamById = new Map(
    teamIds.length
      ? db.select({ id: teams.id, name: teams.name, color: teams.color }).from(teams).where(inArray(teams.id, teamIds)).all().map((t) => [t.id, t])
      : [],
  );

  return rows.map((row) => {
    const actor = row.actorUserId ? (userById.get(row.actorUserId) ?? null) : null;
    const onBehalfOf = row.onBehalfOfUserId ? (userById.get(row.onBehalfOfUserId) ?? null) : null;
    const team = row.teamId ? (teamById.get(row.teamId) ?? null) : null;
    const action = row.action as AuditAction;
    const details = JSON.parse(row.details) as unknown;

    const base = {
      id: row.id,
      bingoId: row.bingoId,
      at: row.createdAt.toISOString(),
      action,
      visibility: row.visibility as AuditVisibility,
      actor,
      actorType: row.actorType as AuditEntry["actorType"],
      actorRole: row.actorRole as AuditEntry["actorRole"],
      onBehalfOf,
      entityType: row.entityType as AuditEntry["entityType"],
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      team,
      requestId: row.requestId,
      details,
    };
    const { category, tone } = AUDIT_ACTIONS[action];
    return { ...base, category, tone, label: renderAuditLabel(base) };
  });
}

function applyFilters(conditions: (ReturnType<typeof eq> | undefined)[], filters: AuditLogFilters) {
  if (filters.action?.length) conditions.push(inArray(auditLog.action, filters.action));
  if (filters.category?.length) conditions.push(inArray(auditLog.action, filters.category.flatMap(actionsInCategory)));
  if (filters.actorUserId?.length) conditions.push(inArray(auditLog.actorUserId, filters.actorUserId));
  if (filters.teamId?.length) conditions.push(inArray(auditLog.teamId, filters.teamId));
  if (filters.entityType) conditions.push(eq(auditLog.entityType, filters.entityType));
  if (filters.entityId) conditions.push(eq(auditLog.entityId, filters.entityId));
  if (filters.visibility) conditions.push(eq(auditLog.visibility, filters.visibility));
  if (filters.since) conditions.push(gte(auditLog.createdAt, new Date(filters.since)));
  if (filters.until) conditions.push(lte(auditLog.createdAt, new Date(filters.until)));
  if (filters.q) conditions.push(or(like(auditLog.entityLabel, `%${filters.q}%`), like(auditLog.action, `%${filters.q}%`)));
}

// `condensed` collapses runs of alike entries within this page (see condenseAuditEntries); the cursor
// is computed from the raw rows, so paging is unaffected and a group never spans two pages.
function paginate(db: Db, conditions: ReturnType<typeof and>, limit: number, condensed = false): AuditLogResponse {
  const rows = db.select().from(auditLog).where(conditions).orderBy(desc(auditLog.id)).limit(limit + 1).all();
  const nextCursor = rows.length > limit ? rows[limit - 1]!.id : null;
  const entries = toAuditEntries(db, rows.slice(0, limit));
  return { entries: condensed ? condenseAuditEntries(entries) : entries, nextCursor };
}

export function queryAuditLog(
  db: Db,
  scope: { bingoId: string | null | "all" },
  filters: AuditLogFilters,
  page: { cursor?: number; limit?: number; condensed?: boolean } = {},
): AuditLogResponse {
  const limit = Math.min(page.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const conditions: (ReturnType<typeof eq> | undefined)[] = [];
  if (scope.bingoId === null) conditions.push(isNull(auditLog.bingoId));
  else if (scope.bingoId !== "all") conditions.push(eq(auditLog.bingoId, scope.bingoId));
  applyFilters(conditions, filters);
  if (page.cursor !== undefined) conditions.push(lt(auditLog.id, page.cursor));

  return paginate(db, and(...conditions.filter((c): c is NonNullable<typeof c> => !!c)), limit, page.condensed);
}

const TEAM_ACTIVITY_DEFAULT_LIMIT = 50;

// This feed is the "Recent activity" list under a team's own roster
// (TeamInfoDialog) — a highlight reel of what happened to *this team*, not a
// general bingo log. Site-wide `public` rows (stage.changed, draft.started)
// pass the visibility rule below but are noise here, so they're filtered out
// by category too. The full picture (including these) is still available in
// the mod panel's Audit log tab via queryAuditLog.
const TEAM_ACTIVITY_CATEGORIES: AuditCategory[] = ["submission", "points", "team"];
// Hands going up and down on tile parts are coordination chatter, not
// history; the board already shows who's on what. Likewise the automatic
// screenshot/codeword analysis results — mod-review detail that reads as
// noise (especially failures) in a team's own highlight reel; mods still
// see them in the mod panel's Audit tab.
const TEAM_ACTIVITY_EXCLUDED_ACTIONS: AuditAction[] = [
  "team.tile_interest_set",
  "submission.screenshot_analyzed",
  "submission.screenshot_analysis_failed",
];
const TEAM_ACTIVITY_ACTIONS = TEAM_ACTIVITY_CATEGORIES.flatMap(actionsInCategory).filter((a) => !TEAM_ACTIVITY_EXCLUDED_ACTIONS.includes(a));

// Player rule: their own team's team/public rows, plus site-wide public
// rows (team_id null). A mod instead sees every row scoped to this team,
// regardless of visibility — see docs/audit-log-plan.md's visibility model.
export function queryTeamActivity(
  db: Db,
  bingoId: string,
  teamId: string,
  opts: { isMod: boolean; cursor?: number; limit?: number; condensed?: boolean },
): AuditLogResponse {
  const limit = Math.min(opts.limit ?? TEAM_ACTIVITY_DEFAULT_LIMIT, MAX_LIMIT);
  const visibilityRule = opts.isMod
    ? eq(auditLog.teamId, teamId)
    : or(
        and(eq(auditLog.teamId, teamId), inArray(auditLog.visibility, ["team", "public"])),
        and(isNull(auditLog.teamId), eq(auditLog.visibility, "public")),
      );

  const conditions = [
    eq(auditLog.bingoId, bingoId),
    visibilityRule,
    inArray(auditLog.action, TEAM_ACTIVITY_ACTIONS),
  ];
  if (opts.cursor !== undefined) conditions.push(lt(auditLog.id, opts.cursor));

  return paginate(db, and(...conditions), limit, opts.condensed);
}

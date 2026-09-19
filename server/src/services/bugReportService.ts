import { desc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { MinimalUser } from "@bingo/shared";
import * as schema from "../db/schema";
import { bugReports, users } from "../db/schema";
import { ServiceError } from "./errors";
import { audit } from "../audit/record";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

const DESCRIPTION_MAX_LENGTH = 2000;
const PALETTE_MAX_LENGTH = 100;

export interface CreateBugReportParams {
  reporterUserId: string;
  description: string;
  pageUrl: string | null;
  userAgent: string | null;
  /** The theme/palette the reporter was viewing; free text from the client, so it is trimmed and capped here. */
  palette?: string | null;
  /** Best-effort tag resolved by the route from pageUrl; null off-bingo. */
  bingoId: string | null;
}

export function createBugReport(db: Db, params: CreateBugReportParams) {
  const description = params.description.trim();
  if (!description) throw new ServiceError(400, "Description is required");
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    throw new ServiceError(400, `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer`);
  }

  return db.transaction((tx) => {
    const row = tx
      .insert(bugReports)
      .values({
        bingoId: params.bingoId,
        reporterUserId: params.reporterUserId,
        description,
        pageUrl: params.pageUrl,
        userAgent: params.userAgent,
        palette: params.palette?.trim().slice(0, PALETTE_MAX_LENGTH) || null,
      })
      .returning()
      .get();

    // Tagging the audit row with the same bingoId (when known) surfaces this
    // entry in that bingo's own mod audit log, not just the site-wide one.
    audit(tx, {
      action: "bug_report.created",
      bingoId: row.bingoId,
      entity: { type: "bug_report", id: row.id, label: null },
      details: { description, pageUrl: row.pageUrl, palette: row.palette },
    });

    return row;
  });
}

export function getBugReports(db: Queryable) {
  const rows = db.select().from(bugReports).orderBy(desc(bugReports.createdAt)).all();
  if (rows.length === 0) return [];

  const reporterIds = [...new Set(rows.map((r) => r.reporterUserId))];
  const userRows = db
    .select({ id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick })
    .from(users)
    .where(inArray(users.id, reporterIds))
    .all();
  const userById = new Map<string, MinimalUser>(userRows.map((u) => [u.id, u]));

  return rows.map((r) => ({ ...r, reporter: userById.get(r.reporterUserId) ?? null }));
}

export interface ResolveBugReportParams {
  resolved: boolean;
  resolvedByUserId: string;
}

export function resolveBugReport(db: Db, id: string, params: ResolveBugReportParams) {
  const existing = db.select().from(bugReports).where(eq(bugReports.id, id)).get();
  if (!existing) throw new ServiceError(404, "Bug report not found");

  return db.transaction((tx) => {
    const row = tx
      .update(bugReports)
      .set({
        status: params.resolved ? "resolved" : "open",
        resolvedByUserId: params.resolved ? params.resolvedByUserId : null,
        resolvedAt: params.resolved ? new Date() : null,
      })
      .where(eq(bugReports.id, id))
      .returning()
      .get();

    audit(tx, {
      action: "bug_report.resolved",
      bingoId: existing.bingoId,
      entity: { type: "bug_report", id: row.id, label: null },
      details: { resolved: params.resolved },
    });

    return row;
  });
}

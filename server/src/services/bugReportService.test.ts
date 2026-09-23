import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createBugReport, getBugReports, setBugReportStatus } from "./bugReportService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;
let reporterId: string;
let modId: string;
let bingoId: string;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  reporterId = db.insert(schema.users).values({ discordId: "reporter", discordUsername: "reporter" }).returning().get().id;
  modId = db.insert(schema.users).values({ discordId: "mod", discordUsername: "mod" }).returning().get().id;
  bingoId = db
    .insert(schema.bingos)
    .values({ slug: "test-bingo", name: "Test Bingo", boardRows: 3, boardCols: 3, createdByUserId: reporterId })
    .returning()
    .get().id;
});
afterEach(() => {
  sqlite.close();
});

describe("createBugReport palette", () => {
  it("records the palette the reporter was viewing, and lists it back", () => {
    createBugReport(db, { reporterUserId: reporterId, description: "Cover colour flashes", pageUrl: "/b/x", userAgent: null, palette: "comic · Blackout (dark, system)", bingoId: null });
    expect(getBugReports(db)[0]!.palette).toBe("comic · Blackout (dark, system)");
  });

  it("stores null when none is sent (older clients), and caps and trims what is", () => {
    const none = createBugReport(db, { reporterUserId: reporterId, description: "a", pageUrl: null, userAgent: null, bingoId: null });
    expect(none.palette).toBeNull();
    const blank = createBugReport(db, { reporterUserId: reporterId, description: "b", pageUrl: null, userAgent: null, palette: "   ", bingoId: null });
    expect(blank.palette).toBeNull();
    const long = createBugReport(db, { reporterUserId: reporterId, description: "c", pageUrl: null, userAgent: null, palette: `  ${"x".repeat(500)}  `, bingoId: null });
    expect(long.palette).toBe("x".repeat(100));
  });
});

describe("createBugReport", () => {
  it("creates an open report with the captured page/user-agent context", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Board didn't refresh", pageUrl: "/bingos/foo", userAgent: "Mozilla/5.0", bingoId: null });
    expect(report.status).toBe("open");
    expect(report.description).toBe("Board didn't refresh");
    expect(report.pageUrl).toBe("/bingos/foo");
    expect(report.userAgent).toBe("Mozilla/5.0");
    expect(report.bingoId).toBeNull();
    expect(report.resolvedByUserId).toBeNull();
    expect(report.resolvedAt).toBeNull();
  });

  it("tags the report with the resolved bingoId when the reporter was on a bingo page", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Tile won't submit", pageUrl: "/b/test-bingo/mod", userAgent: null, bingoId });
    expect(report.bingoId).toBe(bingoId);
  });

  it("trims whitespace from the description", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "  spaced  ", pageUrl: null, userAgent: null, bingoId: null });
    expect(report.description).toBe("spaced");
  });

  it("rejects an empty description", () => {
    expect(() => createBugReport(db, { reporterUserId: reporterId, description: "   ", pageUrl: null, userAgent: null, bingoId: null })).toThrow(ServiceError);
  });

  it("rejects a description over the length cap", () => {
    expect(() => createBugReport(db, { reporterUserId: reporterId, description: "a".repeat(2001), pageUrl: null, userAgent: null, bingoId: null })).toThrow(ServiceError);
  });
});

describe("getBugReports", () => {
  it("returns reports newest-first with reporter info attached", () => {
    const first = createBugReport(db, { reporterUserId: reporterId, description: "First", pageUrl: null, userAgent: null, bingoId: null });
    // createdAt has second precision — backdate the first report so ordering
    // is deterministic even when both inserts land in the same second.
    db.update(schema.bugReports).set({ createdAt: new Date(Date.now() - 10_000) }).where(eq(schema.bugReports.id, first.id)).run();
    createBugReport(db, { reporterUserId: reporterId, description: "Second", pageUrl: null, userAgent: null, bingoId: null });

    const reports = getBugReports(db);
    expect(reports.map((r) => r.description)).toEqual(["Second", "First"]);
    expect(reports[0]!.reporter?.discordUsername).toBe("reporter");
  });

  it("attaches the resolver's user info once resolved, and null while open", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: null, userAgent: null, bingoId: null });
    expect(getBugReports(db)[0]!.resolvedByUser).toBeNull();

    setBugReportStatus(db, report.id, { status: "resolved", actorUserId: modId });
    const resolved = getBugReports(db)[0]!;
    expect(resolved.resolvedByUser?.discordUsername).toBe("mod");
  });

  it("filters to a single reporter's reports when reporterUserId is given, and returns all otherwise", () => {
    const otherReporterId = db.insert(schema.users).values({ discordId: "other", discordUsername: "other" }).returning().get().id;
    createBugReport(db, { reporterUserId: reporterId, description: "Mine", pageUrl: null, userAgent: null, bingoId: null });
    createBugReport(db, { reporterUserId: otherReporterId, description: "Theirs", pageUrl: null, userAgent: null, bingoId: null });

    expect(getBugReports(db, { reporterUserId: reporterId }).map((r) => r.description)).toEqual(["Mine"]);
    expect(getBugReports(db).map((r) => r.description).sort()).toEqual(["Mine", "Theirs"]);
  });
});

describe("setBugReportStatus", () => {
  it("marks a report resolved, stamping resolvedBy/resolvedAt", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: null, userAgent: null, bingoId: null });
    const resolved = setBugReportStatus(db, report.id, { status: "resolved", actorUserId: modId });
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedByUserId).toBe(modId);
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it("marks a report closed, stamping resolvedBy/resolvedAt", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: null, userAgent: null, bingoId: null });
    const closed = setBugReportStatus(db, report.id, { status: "closed", actorUserId: modId, resolutionMessage: "Won't implement — out of scope" });
    expect(closed.status).toBe("closed");
    expect(closed.resolvedByUserId).toBe(modId);
    expect(closed.resolvedAt).not.toBeNull();
    expect(closed.resolutionMessage).toBe("Won't implement — out of scope");
  });

  it("reopens a resolved or closed report, clearing resolvedBy/resolvedAt/resolutionMessage", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: null, userAgent: null, bingoId: null });
    setBugReportStatus(db, report.id, { status: "closed", actorUserId: modId, resolutionMessage: "Not now" });
    const reopened = setBugReportStatus(db, report.id, { status: "open", actorUserId: modId });
    expect(reopened.status).toBe("open");
    expect(reopened.resolvedByUserId).toBeNull();
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.resolutionMessage).toBeNull();
  });

  it("throws on an unknown id", () => {
    expect(() => setBugReportStatus(db, "missing", { status: "resolved", actorUserId: modId })).toThrow(ServiceError);
  });

  it("stores a trimmed resolution message when resolving", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: null, userAgent: null, bingoId: null });
    const resolved = setBugReportStatus(db, report.id, { status: "resolved", actorUserId: modId, resolutionMessage: "  Fixed in v2  " });
    expect(resolved.resolutionMessage).toBe("Fixed in v2");
  });

  it("stores null when resolving without a message, or with a blank one", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: null, userAgent: null, bingoId: null });
    const resolved = setBugReportStatus(db, report.id, { status: "resolved", actorUserId: modId, resolutionMessage: "   " });
    expect(resolved.resolutionMessage).toBeNull();
  });

  it("clears the resolution message on reopen", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: null, userAgent: null, bingoId: null });
    setBugReportStatus(db, report.id, { status: "resolved", actorUserId: modId, resolutionMessage: "Fixed" });
    const reopened = setBugReportStatus(db, report.id, { status: "open", actorUserId: modId });
    expect(reopened.resolutionMessage).toBeNull();
  });

  it("rejects a resolution message over the length cap", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: null, userAgent: null, bingoId: null });
    expect(() => setBugReportStatus(db, report.id, { status: "resolved", actorUserId: modId, resolutionMessage: "a".repeat(2001) })).toThrow(ServiceError);
  });
});

describe("audit trail", () => {
  it("createBugReport records bug_report.created, site-scoped (bingoId null) when reported off-bingo", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: "/mod", userAgent: null, palette: "default · Light (light)", bingoId: null });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "bug_report.created")).get()!;
    expect(row.bingoId).toBeNull();
    expect(row.entityId).toBe(report.id);
    expect(JSON.parse(row.details)).toEqual({ description: "Bug", pageUrl: "/mod", palette: "default · Light (light)" });
  });

  it("createBugReport tags the audit row with the report's bingoId when reported from a bingo page", () => {
    createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: "/b/test-bingo/mod", userAgent: null, bingoId });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "bug_report.created")).get()!;
    expect(row.bingoId).toBe(bingoId);
  });

  it("setBugReportStatus records bug_report.status_changed, carrying the report's bingoId", () => {
    const report = createBugReport(db, { reporterUserId: reporterId, description: "Bug", pageUrl: "/b/test-bingo/mod", userAgent: null, bingoId });
    setBugReportStatus(db, report.id, { status: "resolved", actorUserId: modId });
    const row = db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "bug_report.status_changed")).get()!;
    expect(row.bingoId).toBe(bingoId);
    expect(JSON.parse(row.details)).toEqual({ status: "resolved", resolutionMessage: null });
  });
});

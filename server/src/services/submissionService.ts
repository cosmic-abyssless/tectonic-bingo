import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ClaimInput, NodeKind } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, nodes, submissions, submissionScreenshots, teamNodeState, teams, tiles, users } from "../db/schema";
import { ServiceError } from "./errors";
import { findAncestorIds } from "./graphService";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Bingo = typeof schema.bingos.$inferSelect;

// Which tile (if any) a leaf belongs to, found by walking edges upward from
// the leaf until an ancestor matches a tile's root node.
function tileForLeaf(db: Db | Tx, leafId: string, tileByNodeId: Map<string, typeof tiles.$inferSelect>): typeof tiles.$inferSelect | null {
  const ancestors = findAncestorIds(db, leafId);
  for (const nodeId of ancestors) {
    const tile = tileByNodeId.get(nodeId);
    if (tile) return tile;
  }
  return null;
}

export interface CreateSubmissionParams {
  teamId: string;
  submittedByUserId: string;
  claims: ClaimInput[];
  screenshotUrl: string;
  now?: Date; // injectable for tests
}

// All submission-time gating lives here — the client mirrors these checks
// for UX, but this is the enforcement.
export function createSubmission(db: Db, bingo: Bingo, params: CreateSubmissionParams) {
  return db.transaction((tx) => {
    const now = params.now ?? new Date();

    if (bingo.stage !== "live") {
      throw new ServiceError(400, "Submissions are only open while the bingo is live");
    }
    if (!bingo.startsAt || now < bingo.startsAt) {
      throw new ServiceError(400, "The bingo has not started yet");
    }
    if (params.claims.length === 0) throw new ServiceError(400, "At least one claim is required");

    const nodeIds = [...new Set(params.claims.map((c) => c.nodeId))];
    if (nodeIds.length !== params.claims.length) {
      throw new ServiceError(400, "A submission may not claim the same requirement twice — combine into one claim with a quantity");
    }
    const leaves = tx.select().from(nodes).where(inArray(nodes.id, nodeIds)).all();
    if (leaves.length !== nodeIds.length || leaves.some((n) => n.kind !== "ITEM" && n.kind !== "MANUAL")) {
      throw new ServiceError(400, "Claims must target requirement leaves");
    }
    const leafById = new Map(leaves.map((n) => [n.id, n]));

    // Launch scope: one submission covers one tile. Drop this to allow
    // cross-tile claims.
    const tileRows = tx.select().from(tiles).where(eq(tiles.bingoId, bingo.id)).all();
    const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));
    const tilesTouched = new Set(nodeIds.map((id) => tileForLeaf(tx, id, tileByNodeId)?.id ?? null));
    if (tilesTouched.size !== 1 || tilesTouched.has(null)) {
      throw new ServiceError(400, "All claims in a submission must belong to the same tile");
    }
    const tile = tileRows.find((t) => t.id === [...tilesTouched][0])!;

    if (tile.hasFreezePeriod) {
      const unlockAt = new Date(bingo.startsAt.getTime() + tile.freezeDurationMinutes * 60_000);
      if (now < unlockAt) {
        throw new ServiceError(400, `This tile is frozen until ${unlockAt.toISOString()}`);
      }
    }

    // submitGateNodeId: every ancestor of a claimed leaf (up to and including
    // the tile) that names a gate must have that gate already complete for
    // this team.
    const completedNodeIds = new Set(
      tx.select({ nodeId: teamNodeState.nodeId }).from(teamNodeState).where(eq(teamNodeState.teamId, params.teamId)).all().map((r) => r.nodeId),
    );
    for (const leafId of nodeIds) {
      const ancestorIds = [...findAncestorIds(tx, leafId)];
      const ancestors = tx.select().from(nodes).where(inArray(nodes.id, ancestorIds)).all();
      for (const ancestor of ancestors) {
        if (ancestor.submitGateNodeId && !completedNodeIds.has(ancestor.submitGateNodeId)) {
          throw new ServiceError(400, `${ancestor.label ?? "This requirement"}: the previous requirement must be completed first`);
        }
      }
    }

    for (const claim of params.claims) {
      const leaf = leafById.get(claim.nodeId)!;
      if (leaf.kind !== "ITEM") continue;
      if (!claim.itemName) throw new ServiceError(400, "itemName is required for item claims");
      if (claim.itemName.toLowerCase() !== (leaf.itemName ?? "").toLowerCase()) {
        throw new ServiceError(400, `itemName does not match this requirement (expected "${leaf.itemName}")`);
      }
    }

    const submission = tx
      .insert(submissions)
      .values({ teamId: params.teamId, submittedByUserId: params.submittedByUserId })
      .returning()
      .get();

    tx.insert(submissionScreenshots).values({ submissionId: submission.id, storageUrl: params.screenshotUrl }).run();

    for (const claim of params.claims) {
      tx.insert(claims)
        .values({
          submissionId: submission.id,
          nodeId: claim.nodeId,
          itemName: claim.itemName ?? null,
          quantity: claim.quantity ?? 1,
        })
        .run();
    }

    return submission;
  });
}

// Runs after createSubmission, once OCR finishes — see routes/bingos.ts.
// Best-effort: mods can still review without it, so a failure just leaves
// scrapeStatus "failed" rather than the submission itself.
export function recordScreenshotAnalysis(
  db: Db,
  submissionId: string,
  result: { extractedText: string[]; codewordFound: boolean; detectedItemName: string | null },
) {
  db.update(submissionScreenshots)
    .set({
      extractedText: result.extractedText.join("\n"),
      codewordVerified: result.codewordFound,
      detectedItemName: result.detectedItemName,
      scrapeStatus: "completed",
      scrapedAt: new Date(),
    })
    .where(eq(submissionScreenshots.submissionId, submissionId))
    .run();
}

export function markScreenshotAnalysisFailed(db: Db, submissionId: string) {
  db.update(submissionScreenshots).set({ scrapeStatus: "failed" }).where(eq(submissionScreenshots.submissionId, submissionId)).run();
}

export type MinimalUser = Pick<typeof users.$inferSelect, "id" | "discordUsername" | "discordGlobalName" | "discordGuildNick">;

export interface ClaimRow {
  id: string;
  submissionId: string;
  nodeId: string;
  itemName: string | null;
  quantity: number;
}

export interface SubmissionDetails {
  submission: typeof submissions.$inferSelect;
  screenshots: (typeof submissionScreenshots.$inferSelect)[];
  claims: ClaimRow[];
  submittedByUser: MinimalUser | null;
}

// Attaches screenshots, claims, and the submitter's (minimal) user row to a
// set of submissions — every submission list the client renders needs all
// three to be reviewable/displayable.
function attachDetails(db: Db, subs: (typeof submissions.$inferSelect)[]): SubmissionDetails[] {
  if (subs.length === 0) return [];
  const submissionIds = subs.map((s) => s.id);
  const screenshots = db.select().from(submissionScreenshots).where(inArray(submissionScreenshots.submissionId, submissionIds)).all();
  const claimRows = db.select().from(claims).where(inArray(claims.submissionId, submissionIds)).all();
  const userIds = [...new Set(subs.map((s) => s.submittedByUserId))];
  const userRows = db
    .select({ id: users.id, discordUsername: users.discordUsername, discordGlobalName: users.discordGlobalName, discordGuildNick: users.discordGuildNick })
    .from(users)
    .where(inArray(users.id, userIds))
    .all();
  const userById = new Map(userRows.map((u) => [u.id, u]));

  return subs.map((s) => ({
    submission: s,
    screenshots: screenshots.filter((sc) => sc.submissionId === s.id),
    claims: claimRows.filter((c) => c.submissionId === s.id),
    submittedByUser: userById.get(s.submittedByUserId) ?? null,
  }));
}

export interface ClaimedLeaf {
  id: string;
  kind: NodeKind;
  label: string | null;
}

export interface ModSubmissionRow extends SubmissionDetails {
  leaves: ClaimedLeaf[];
  tile: typeof tiles.$inferSelect;
  team: Pick<typeof teams.$inferSelect, "id" | "name" | "color">;
}

export function getAllSubmissionsForBingo(db: Db, bingoId: string): ModSubmissionRow[] {
  const rows = db
    .select({ submission: submissions, team: { id: teams.id, name: teams.name, color: teams.color } })
    .from(submissions)
    .innerJoin(teams, eq(submissions.teamId, teams.id))
    .where(eq(teams.bingoId, bingoId))
    .all();

  const details = attachDetails(db, rows.map((r) => r.submission));
  const leafIds = [...new Set(details.flatMap((d) => d.claims.map((c) => c.nodeId)))];
  const leafRows = leafIds.length ? db.select({ id: nodes.id, kind: nodes.kind, label: nodes.label }).from(nodes).where(inArray(nodes.id, leafIds)).all() : [];
  const leafById = new Map(leafRows.map((l) => [l.id, l]));

  const tileRows = db.select().from(tiles).where(eq(tiles.bingoId, bingoId)).all();
  const tileByNodeId = new Map(tileRows.map((t) => [t.nodeId, t]));

  return rows.map((r, i) => {
    const d = details[i]!;
    const claimedNodeIds = [...new Set(d.claims.map((c) => c.nodeId))];
    const leaves = claimedNodeIds.map((id) => leafById.get(id)!).filter(Boolean);
    const firstLeafId = claimedNodeIds[0];
    const tile = firstLeafId ? tileForLeaf(db, firstLeafId, tileByNodeId) : null;
    return { ...d, leaves, tile: tile!, team: r.team };
  });
}

export function getPendingSubmissions(db: Db, bingoId: string) {
  return getAllSubmissionsForBingo(db, bingoId).filter((row) => row.submission.status === "pending");
}

export function getPendingCount(db: Db, bingoId: string): number {
  return getPendingSubmissions(db, bingoId).length;
}

export function getSubmissionById(db: Db, submissionId: string) {
  return db.select().from(submissions).where(eq(submissions.id, submissionId)).get();
}

export function getTeamSubmissions(db: Db, teamId: string): SubmissionDetails[] {
  return attachDetails(db, db.select().from(submissions).where(eq(submissions.teamId, teamId)).all());
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { auditLog, claims, submissions } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile, updateNode } from "./boardService";
import { exportBingo, importBingo } from "./bingoExportService";
import { GePriceTable } from "./gePriceService";
import { fillMissingGpValues } from "./gpValueService";
import { countPricedSubmissions, repriceNodeClaims, repriceSubmission } from "./gpRepriceService";
import { getNodeTrees } from "./graphService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const MAPPING = [
  { id: 1635, name: "Gold ring" },
  { id: 28316, name: "Magus ring" },
  { id: 2550, name: "Seers ring" },
  { id: 28276, name: "Chromium ingot" },
];
const LATEST = {
  data: {
    "1635": { high: 160, low: 160 },
    "28316": { high: 23_000_000, low: 23_000_000 },
    "2550": { high: 800_000, low: 800_000 },
    "28276": { high: 50_000, low: 50_000 },
  },
};
// Magus vestige (starter Piece value) = 23M − 800K − 3 × 50K = 22.05M, so a gold ring valued as it ÷ 3 is 7.35M.
const GOLD_RING_AS_THIRD_OF_VESTIGE = 7_350_000;

async function loadedTable(latest = LATEST): Promise<GePriceTable> {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url).endsWith("/mapping") ? MAPPING : latest)));
  const table = new GePriceTable(fetchImpl as unknown as typeof fetch, () => 0, () => true);
  await table.refreshIfStale();
  return table;
}

function seed() {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const [bingo] = db.insert(schema.bingos).values({ slug: "dt2", name: "DT2", boardRows: 1, boardCols: 1, createdByUserId: admin!.id }).returning().all();
  const [team] = db.insert(schema.teams).values({ bingoId: bingo!.id, captainUserId: admin!.id, name: "A", codeword: "a" }).returning().all();
  const tile = createTile(db, { bingoId: bingo!.id, name: "DT2 Issue 1", boardRow: 0, boardCol: 0 });
  const duke = createTask(db, tile.id, { kind: "ITEM", itemName: "Gold ring", label: "Duke page", valuedAs: { itemName: "Magus vestige", divisor: 3, source: " Duke " } });
  const plain = createTask(db, tile.id, { kind: "ITEM", itemName: "Gold ring", label: "Any gold ring" });
  return { adminId: admin!.id, bingoId: bingo!.id, teamId: team!.id, tileId: tile.id, duke, plain };
}

function claim(fx: ReturnType<typeof seed>, nodeId: string, gpValue: number | null = null) {
  const [submission] = db.insert(submissions).values({ teamId: fx.teamId, submittedByUserId: fx.adminId }).returning().all();
  const [row] = db.insert(claims).values({ submissionId: submission!.id, nodeId, itemName: "Gold ring", gpValue }).returning().all();
  return { submissionId: submission!.id, claimId: row!.id };
}

const gpOf = (claimId: string) => db.select({ gpValue: claims.gpValue }).from(claims).where(eq(claims.id, claimId)).get()!.gpValue;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("Valued as", () => {
  it("is saved on an item Task and read back", () => {
    const fx = seed();
    expect(getNodeTrees(db, [fx.duke.id]).get(fx.duke.id)!.valuedAs).toEqual({ itemName: "Magus vestige", divisor: 3, source: "Duke" });
    expect(getNodeTrees(db, [fx.plain.id]).get(fx.plain.id)!.valuedAs).toBeNull();
  });

  it("refuses a missing item name or a bad divisor, and is dropped from anything but an item", () => {
    const fx = seed();
    expect(() => updateNode(db, fx.plain.id, { kind: "ITEM", itemName: "Gold ring", valuedAs: { itemName: " ", divisor: 3 } })).toThrow(ServiceError);
    expect(() => updateNode(db, fx.plain.id, { kind: "ITEM", itemName: "Gold ring", valuedAs: { itemName: "Magus vestige", divisor: 0 } })).toThrow(ServiceError);
    expect(() => updateNode(db, fx.plain.id, { kind: "ITEM", itemName: "Gold ring", valuedAs: { itemName: "Magus vestige", divisor: 3, source: "x".repeat(41) } })).toThrow(ServiceError);

    const manual = createTask(db, fx.tileId, { kind: "MANUAL", label: "Proof", valuedAs: { itemName: "Magus vestige", divisor: 3 } });
    expect(getNodeTrees(db, [manual.id]).get(manual.id)!.valuedAs).toBeNull();
  });

  it("prices claims on that Task as the item ÷ divisor (using its Piece value), and others as their own item", async () => {
    const fx = seed();
    const onDuke = claim(fx, fx.duke.id);
    const plain = claim(fx, fx.plain.id);

    fillMissingGpValues(db, await loadedTable());

    expect(gpOf(onDuke.claimId)).toBe(GOLD_RING_AS_THIRD_OF_VESTIGE);
    expect(gpOf(plain.claimId)).toBe(160);
  });

  it("survives export and import", () => {
    const fx = seed();
    const imported = importBingo(db, exportBingo(db, fx.bingoId), { slug: "dt2-copy", createdByUserId: fx.adminId });
    const valued = db.select().from(schema.nodes).where(eq(schema.nodes.bingoId, imported.id)).all().filter((n) => n.valuedAsItemName);
    expect(valued.map((n) => [n.valuedAsItemName, n.valuedAsDivisor, n.valuedAsSource])).toEqual([["Magus vestige", 3, "Duke"]]);
  });
});

describe("repriceSubmission", () => {
  it("re-prices a claim that was priced from the wrong thing, and logs before and after", async () => {
    const fx = seed();
    const { submissionId, claimId } = claim(fx, fx.duke.id, 158);

    const changed = await repriceSubmission(db, fx.bingoId, submissionId, await loadedTable());

    expect(changed).toEqual([{ itemName: "Gold ring", before: 158, after: GOLD_RING_AS_THIRD_OF_VESTIGE }]);
    expect(gpOf(claimId)).toBe(GOLD_RING_AS_THIRD_OF_VESTIGE);
    const entry = db.select().from(auditLog).where(eq(auditLog.action, "submission.repriced")).get()!;
    expect(JSON.parse(entry.details)).toMatchObject({ tileName: "DT2 Issue 1", claims: changed });
  });

  it("keeps a value it can't price right now, and logs nothing when nothing changed", async () => {
    const fx = seed();
    const { submissionId, claimId } = claim(fx, fx.duke.id, 158);
    // No Magus ring trades: the vestige, and so the gold ring, can't be priced.
    const table = await loadedTable({ data: { ...LATEST.data, "28316": { high: null, low: null } } } as never);

    expect(await repriceSubmission(db, fx.bingoId, submissionId, table)).toEqual([]);
    expect(gpOf(claimId)).toBe(158);
    expect(db.select().from(auditLog).where(eq(auditLog.action, "submission.repriced")).all()).toEqual([]);
  });

  it("refuses a submission of another bingo", async () => {
    const fx = seed();
    const { submissionId } = claim(fx, fx.duke.id, 158);
    await expect(repriceSubmission(db, "another-bingo", submissionId, await loadedTable())).rejects.toMatchObject({ status: 404 });
  });
});

describe("re-pricing a Task after its Valued as changed", () => {
  it("counts the submissions already priced from it", () => {
    const fx = seed();
    claim(fx, fx.duke.id, 158);
    claim(fx, fx.duke.id, 158);
    claim(fx, fx.duke.id); // not priced yet
    claim(fx, fx.plain.id, 160);
    expect(countPricedSubmissions(db, fx.bingoId, fx.duke.id)).toBe(2);
  });

  it("re-prices only that Task's claims, fills ones with no value, and audits each submission", async () => {
    const fx = seed();
    const wrong = claim(fx, fx.duke.id, 158);
    const empty = claim(fx, fx.duke.id);
    const other = claim(fx, fx.plain.id, 999);
    // A second claim on another Task in the same submission is left alone.
    const [sameSub] = db.insert(claims).values({ submissionId: wrong.submissionId, nodeId: fx.plain.id, itemName: "Gold ring", gpValue: 123 }).returning().all();

    expect(await repriceNodeClaims(db, fx.bingoId, fx.duke.id, await loadedTable())).toBe(2);

    expect(gpOf(wrong.claimId)).toBe(GOLD_RING_AS_THIRD_OF_VESTIGE);
    expect(gpOf(empty.claimId)).toBe(GOLD_RING_AS_THIRD_OF_VESTIGE);
    expect(gpOf(other.claimId)).toBe(999);
    expect(gpOf(sameSub!.id)).toBe(123);
    expect(db.select().from(auditLog).where(eq(auditLog.action, "submission.repriced")).all()).toHaveLength(2);
  });
});

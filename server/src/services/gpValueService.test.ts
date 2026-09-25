import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { claims, submissions } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { createTask, createTile } from "./boardService";
import { GePriceTable } from "./gePriceService";
import { fillMissingGpValues, pricer } from "./gpValueService";
import { createPieceValue, deletePieceValue, getPieceValues, getUnvaluedItems, setUnvaluedItemDismissed, updatePieceValue } from "./pieceValueService";
import { ServiceError } from "./errors";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

const MAPPING = [
  { id: 4151, name: "Abyssal whip" },
  { id: 13263, name: "Abyssal bludgeon" },
  { id: 22804, name: "Brimstone ring" },
  { id: 28307, name: "Ultor ring" },
  { id: 6737, name: "Berserker ring" },
  { id: 28276, name: "Chromium ingot" },
  { id: 999, name: "Untraded thing" },
  { id: 28338, name: "Soulreaper axe" },
];
const LATEST = {
  data: {
    "4151": { high: 1_600_000, low: 1_400_000 },
    "13263": { high: 9_000_000, low: 9_000_000 },
    "22804": { high: 3_000_000, low: 3_000_000 },
    "28307": { high: 100_000_000, low: 100_000_000 },
    "6737": { high: 4_000_000, low: 4_000_000 },
    "28276": { high: 50_000, low: 50_000 },
    "28338": { high: 400_000_000, low: 400_000_000 },
  },
};

async function loadedTable(): Promise<GePriceTable> {
  const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(String(url).endsWith("/mapping") ? MAPPING : LATEST)));
  const table = new GePriceTable(fetchImpl as unknown as typeof fetch, () => 0, () => true);
  await table.refreshIfStale();
  return table;
}

function seed() {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const [bingo] = db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 1, boardCols: 1, createdByUserId: admin!.id }).returning().all();
  const [team] = db.insert(schema.teams).values({ bingoId: bingo!.id, captainUserId: admin!.id, name: "A", codeword: "a" }).returning().all();
  const tile = createTile(db, { bingoId: bingo!.id, name: "Tile", boardRow: 0, boardCol: 0 });
  const task = createTask(db, tile.id, { kind: "ITEM", itemName: "Abyssal whip", label: "Whip", description: "", points: 1 });
  return { adminId: admin!.id, teamId: team!.id, nodeId: task.id };
}

function claim(fx: ReturnType<typeof seed>, itemName: string | null, quantity = 1, gpValue: number | null = null) {
  const [submission] = db.insert(submissions).values({ teamId: fx.teamId, submittedByUserId: fx.adminId }).returning().all();
  const [row] = db.insert(claims).values({ submissionId: submission!.id, nodeId: fx.nodeId, itemName, quantity, gpValue }).returning().all();
  return row!.id;
}

const gpOf = (claimId: string) => db.select({ gpValue: claims.gpValue }).from(claims).where(eq(claims.id, claimId)).get()!.gpValue;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  // Start from no Piece values; the starter ones a migration adds are tested on their own below.
  db.delete(schema.pieceValues).run();
});
afterEach(() => {
  sqlite.close();
});

describe("pricer", () => {
  it("values a claim at unit price × quantity", async () => {
    const price = pricer(db, await loadedTable());
    expect(price.gpValue("Abyssal whip", 3)).toBe(4_500_000);
  });

  it("has no value for MANUAL claims, unknown items, or before prices load", async () => {
    expect(pricer(db, await loadedTable()).gpValue(null, 1)).toBeNull();
    expect(pricer(db, await loadedTable()).gpValue("Vorki", 1)).toBeNull();
    expect(pricer(db, new GePriceTable(vi.fn() as never, () => 0, () => false)).gpValue("Abyssal whip", 1)).toBeNull();
  });

  it("prices a piece as its whole item ÷ divisor, overriding the piece's own price", async () => {
    const fx = seed();
    const table = await loadedTable();
    await createPieceValue(db, { pieceItemName: "Bludgeon axon", wholeItemName: "Abyssal bludgeon", divisor: 3 }, fx.adminId, table);
    await createPieceValue(db, { pieceItemName: "Abyssal whip", wholeItemName: "Brimstone ring", divisor: 2 }, fx.adminId, table);

    const price = pricer(db, table);
    expect(price.gpValue("bludgeon AXON", 2)).toBe(6_000_000);
    expect(price.gpValue("Abyssal whip", 1)).toBe(1_500_000);
  });
});

describe("other pieces", () => {
  it("prices a piece as (whole item − other pieces) ÷ divisor", async () => {
    const fx = seed();
    const table = await loadedTable();
    const pv = await createPieceValue(
      db,
      { pieceItemName: "Ultor vestige", wholeItemName: "Ultor ring", divisor: 1, otherPieces: [{ itemName: "Berserker ring", quantity: 1 }, { itemName: "Chromium ingot", quantity: 3 }] },
      fx.adminId,
      table,
    );

    expect(pv.unitPrice).toBe(95_850_000);
    expect(pv.otherPieces).toEqual([{ itemName: "Berserker ring", quantity: 1 }, { itemName: "Chromium ingot", quantity: 3 }]);
    expect(pricer(db, table).gpValue("Ultor vestige", 1)).toBe(95_850_000);
  });

  it("subtracts before dividing", async () => {
    const fx = seed();
    const table = await loadedTable();
    await createPieceValue(db, { pieceItemName: "Half", wholeItemName: "Ultor ring", divisor: 2, otherPieces: [{ itemName: "Berserker ring", quantity: 1 }] }, fx.adminId, table);
    expect(pricer(db, table).gpValue("Half", 1)).toBe(48_000_000);
  });

  it("has no value while an other piece has no price, or when it works out to zero or less", async () => {
    const fx = seed();
    const table = await loadedTable();
    await createPieceValue(db, { pieceItemName: "Unpriced", wholeItemName: "Ultor ring", divisor: 1, otherPieces: [{ itemName: "Untraded thing", quantity: 1 }] }, fx.adminId, table);
    await createPieceValue(db, { pieceItemName: "Negative", wholeItemName: "Berserker ring", divisor: 1, otherPieces: [{ itemName: "Chromium ingot", quantity: 80 }] }, fx.adminId, table);

    const price = pricer(db, table);
    expect(price.gpValue("Unpriced", 1)).toBeNull();
    expect(price.gpValue("Negative", 1)).toBeNull();
  });

  it("replaces the other pieces on update and drops them with the piece value", async () => {
    const fx = seed();
    const table = await loadedTable();
    const pv = await createPieceValue(db, { pieceItemName: "Ultor vestige", wholeItemName: "Ultor ring", divisor: 1, otherPieces: [{ itemName: "Chromium ingot", quantity: 3 }] }, fx.adminId, table);

    const updated = await updatePieceValue(db, pv.id, { otherPieces: [{ itemName: "Berserker ring", quantity: 1 }] }, table);
    expect(updated.otherPieces).toEqual([{ itemName: "Berserker ring", quantity: 1 }]);
    expect(updated.unitPrice).toBe(96_000_000);

    deletePieceValue(db, pv.id);
    expect(db.select().from(schema.pieceValueOtherPieces).all()).toEqual([]);
  });
});

describe("starter piece values (migration 0025)", () => {
  it("values each DT2 vestige as its ring minus the base ring and 3 chromium ingots", async () => {
    ({ sqlite, db } = createTestDb());
    const table = await loadedTable();
    const starters = getPieceValues(db, table);

    expect(starters.map((p) => p.pieceItemName)).toEqual(
      expect.arrayContaining(["Ultor vestige", "Bellator vestige", "Magus vestige", "Venator vestige", "Araxyte fang", "Hydra's fang", "Hydra's eye", "Hydra's heart", "Executioner's axe head", "Leviathan's lure", "Siren's staff", "Eye of the duke"]),
    );
    expect(starters.find((p) => p.pieceItemName === "Ultor vestige")).toMatchObject({
      wholeItemName: "Ultor ring",
      divisor: 1,
      otherPieces: [{ itemName: "Berserker ring", quantity: 1 }, { itemName: "Chromium ingot", quantity: 3 }],
      unitPrice: 95_850_000,
    });
    // A quarter of the axe; matched case-insensitively, as the board spells it "Eye of the Duke".
    expect(pricer(db, table).gpValue("Eye of the Duke", 1)).toBe(100_000_000);
  });
});

describe("fillMissingGpValues", () => {
  it("fills claims with no value and never changes one already set", async () => {
    const fx = seed();
    const missing = claim(fx, "Abyssal whip", 2);
    const frozen = claim(fx, "Abyssal whip", 1, 1_234);
    const manual = claim(fx, null);

    fillMissingGpValues(db, await loadedTable());

    expect(gpOf(missing)).toBe(3_000_000);
    expect(gpOf(frozen)).toBe(1_234);
    expect(gpOf(manual)).toBeNull();
  });

  it("prices a piece's earlier claims once its piece value is added", async () => {
    const fx = seed();
    const table = await loadedTable();
    const axon = claim(fx, "Bludgeon axon");
    fillMissingGpValues(db, table);
    expect(gpOf(axon)).toBeNull();

    await createPieceValue(db, { pieceItemName: "Bludgeon axon", wholeItemName: "Abyssal bludgeon", divisor: 3 }, fx.adminId, table);

    expect(gpOf(axon)).toBe(3_000_000);
  });
});

describe("piece values", () => {
  const rejects = async (p: Promise<unknown>, status: number) => {
    await expect(p).rejects.toBeInstanceOf(ServiceError);
    await expect(p).rejects.toMatchObject({ status });
  };

  it("refuses a whole item with no GE price, a bad divisor, a duplicate piece and chains", async () => {
    const fx = seed();
    const table = await loadedTable();
    const add = (pieceItemName: string, wholeItemName: string, divisor: number) => createPieceValue(db, { pieceItemName, wholeItemName, divisor }, fx.adminId, table);

    await rejects(add("Vorki piece", "Vorki", 2), 400);
    await rejects(add("Bludgeon axon", "Abyssal bludgeon", 0), 400);
    await rejects(add("Bludgeon axon", "Abyssal bludgeon", 1.5), 400);
    await add("Bludgeon axon", "Abyssal bludgeon", 3);
    await rejects(add("bludgeon axon", "Abyssal bludgeon", 3), 409);
    // The whole item can't itself be a piece, and a piece can't be another rule's whole item.
    await rejects(add("Something", "Bludgeon axon", 2), 400);
    await rejects(add("Abyssal bludgeon", "Abyssal whip", 2), 400);
  });

  it("refuses bad other pieces", async () => {
    const fx = seed();
    const table = await loadedTable();
    const add = (pieceItemName: string, otherPieces: unknown) => createPieceValue(db, { pieceItemName, wholeItemName: "Ultor ring", divisor: 1, otherPieces } as never, fx.adminId, table);

    await rejects(add("Ultor vestige", [{ itemName: "Vorki", quantity: 1 }]), 400);
    await rejects(add("Ultor vestige", [{ itemName: "Chromium ingot", quantity: 0 }]), 400);
    await rejects(add("Ultor vestige", [{ itemName: "Chromium ingot", quantity: 1 }, { itemName: "chromium ingot", quantity: 2 }]), 400);
    await rejects(add("Ultor vestige", [{ itemName: "Ultor ring", quantity: 1 }]), 400);
    await rejects(add("Ultor vestige", [{ itemName: "Ultor vestige", quantity: 1 }]), 400);
    await rejects(add("Ultor vestige", "Chromium ingot"), 400);

    // No chains either way: a piece can't be an other piece, and an other piece can't become a piece.
    await createPieceValue(db, { pieceItemName: "Bludgeon axon", wholeItemName: "Abyssal bludgeon", divisor: 3 }, fx.adminId, table);
    await rejects(add("Ultor vestige", [{ itemName: "Bludgeon axon", quantity: 1 }]), 400);
    await add("Ultor vestige", [{ itemName: "Chromium ingot", quantity: 3 }]);
    await rejects(createPieceValue(db, { pieceItemName: "Chromium ingot", wholeItemName: "Abyssal whip", divisor: 2 }, fx.adminId, table), 400);
  });

  it("refuses while prices can't be loaded", async () => {
    const fx = seed();
    const table = new GePriceTable(vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch, () => 0, () => true);
    await rejects(createPieceValue(db, { pieceItemName: "Bludgeon axon", wholeItemName: "Abyssal bludgeon", divisor: 3 }, fx.adminId, table), 503);
  });

  it("updates and deletes, leaving values already set alone", async () => {
    const fx = seed();
    const table = await loadedTable();
    const pv = await createPieceValue(db, { pieceItemName: "Bludgeon axon", wholeItemName: "Abyssal bludgeon", divisor: 3 }, fx.adminId, table);
    const axon = claim(fx, "Bludgeon axon");
    fillMissingGpValues(db, table);
    expect(gpOf(axon)).toBe(3_000_000);

    const updated = await updatePieceValue(db, pv.id, { divisor: 2 }, table);
    expect(updated.unitPrice).toBe(4_500_000);
    expect(gpOf(axon)).toBe(3_000_000);

    deletePieceValue(db, pv.id);
    expect(pricer(db, table).gpValue("Bludgeon axon", 1)).toBeNull();
    expect(gpOf(axon)).toBe(3_000_000);
  });

  it("lists unvalued items by claim count and marks dismissed ones", async () => {
    const fx = seed();
    claim(fx, "Vorki");
    claim(fx, "vorki");
    claim(fx, "Bludgeon axon");
    claim(fx, null);
    claim(fx, "Abyssal whip", 1, 1_500_000);

    setUnvaluedItemDismissed(db, "Vorki", true, fx.adminId);

    expect(getUnvaluedItems(db)).toEqual([
      { itemName: "Vorki", claimCount: 2, dismissed: true },
      { itemName: "Bludgeon axon", claimCount: 1, dismissed: false },
    ]);

    setUnvaluedItemDismissed(db, "VORKI", false, fx.adminId);
    expect(getUnvaluedItems(db)[0]!.dismissed).toBe(false);
  });

  it("leaves items that have a piece value off the unvalued list", () => {
    const fx = seed();
    claim(fx, "Bludgeon axon");
    // A rule that exists but hasn't priced the claim yet (as after the starter-rules migration, before a fill).
    db.insert(schema.pieceValues).values({ pieceItemName: "Bludgeon axon", wholeItemName: "Abyssal bludgeon", divisor: 3 }).run();

    expect(getUnvaluedItems(db)).toEqual([]);
  });
});

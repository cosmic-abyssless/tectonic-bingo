import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNodeInput } from "@bingo/shared";
import * as schema from "../db/schema";
import { nodeEdges, nodes } from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { deleteNode, deleteSubtree, getApprovedClaims, getFullGraph, getNodeTree, getNodeTrees, insertSubtree, replaceSubtree } from "./graphService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

function seedBingo() {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  return db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin.id }).returning().get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

describe("insertSubtree / getNodeTree", () => {
  it("builds a nested GraphNode with single-name ITEM leaves", () => {
    const input: GraphNodeInput = {
      kind: "ALL",
      label: "Part A",
      points: 25,
      children: [
        { kind: "ITEM", itemName: "Tanzanite fang" },
        { kind: "ITEM", itemName: "Magic fang" },
      ],
    };
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, input));
    const tree = getNodeTree(db, rootId)!;

    expect(tree.kind).toBe("ALL");
    expect(tree.label).toBe("Part A");
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0]!.itemName).toBe("Tanzanite fang");
    expect(tree.children[1]!.itemName).toBe("Magic fang");
  });

  it("resolves a SUM's quantity and its ITEM children", () => {
    const input: GraphNodeInput = {
      kind: "SUM",
      quantity: 10_000,
      children: [{ kind: "ITEM", itemName: "Splinters" }, { kind: "ITEM", itemName: "Demon tears" }],
    };
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, input));
    const tree = getNodeTree(db, rootId)!;

    expect(tree.kind).toBe("SUM");
    expect(tree.quantity).toBe(10_000);
    expect(tree.children.map((c) => c.itemName)).toEqual(["Splinters", "Demon tears"]);
  });

  it("preserves child order via sortOrder", () => {
    const bingo = seedBingo();
    const input: GraphNodeInput = { kind: "ALL", children: [{ kind: "ITEM", itemName: "A" }, { kind: "ITEM", itemName: "B" }, { kind: "ITEM", itemName: "C" }] };
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, input));
    const tree = getNodeTree(db, rootId)!;
    expect(tree.children.map((c) => c.itemName)).toEqual(["A", "B", "C"]);
  });

  it("nests a node reachable from two different roots under both (shared leaf)", () => {
    const bingo = seedBingo();
    const leafId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ITEM", itemName: "Shared" }));
    const rootAId = db.transaction((tx) => {
      const id = tx.insert(nodes).values({ bingoId: bingo.id, kind: "ALL" }).returning().get().id;
      tx.insert(nodeEdges).values({ parentId: id, childId: leafId, sortOrder: 0 }).run();
      return id;
    });
    const rootBId = db.transaction((tx) => {
      const id = tx.insert(nodes).values({ bingoId: bingo.id, kind: "ALL" }).returning().get().id;
      tx.insert(nodeEdges).values({ parentId: id, childId: leafId, sortOrder: 0 }).run();
      return id;
    });
    const trees = getNodeTrees(db, [rootAId, rootBId]);
    expect(trees.get(rootAId)!.children[0]!.id).toBe(leafId);
    expect(trees.get(rootBId)!.children[0]!.id).toBe(leafId);
  });
});

describe("replaceSubtree", () => {
  it("preserves a leaf's id (and thus its claims) across an edit when the input carries its id", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) =>
      insertSubtree(tx, bingo.id, { kind: "ALL", children: [{ kind: "ITEM", itemName: "Vorki", points: 0 }] }),
    );
    const leafId = getNodeTree(db, rootId)!.children[0]!.id;

    db.transaction((tx) => replaceSubtree(tx, rootId, bingo.id, { kind: "ALL", children: [{ id: leafId, kind: "ITEM", itemName: "Vorki", points: 10 }] }));

    const updated = getNodeTree(db, rootId)!;
    expect(updated.children[0]!.id).toBe(leafId); // same id — any claims on it are still valid
    expect(updated.children[0]!.points).toBe(10); // but its fields did update
  });

  it("drops a leaf not reused by the new input", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) =>
      insertSubtree(tx, bingo.id, { kind: "ALL", children: [{ kind: "ITEM", itemName: "A" }, { kind: "ITEM", itemName: "B" }] }),
    );
    const droppedLeafId = getNodeTree(db, rootId)!.children[0]!.id;

    db.transaction((tx) => replaceSubtree(tx, rootId, bingo.id, { kind: "ALL", children: [{ kind: "ITEM", itemName: "B" }] }));

    expect(db.select().from(nodes).all().find((n) => n.id === droppedLeafId)).toBeUndefined();
    expect(getNodeTree(db, rootId)!.children).toHaveLength(1);
  });

  it("does not delete a leaf still referenced by another root (shared across two tasks)", () => {
    const bingo = seedBingo();
    const leafId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ITEM", itemName: "Shared" }));
    const taskARoot = db.transaction((tx) => {
      const id = tx.insert(nodes).values({ bingoId: bingo.id, kind: "ALL" }).returning().get().id;
      tx.insert(nodeEdges).values({ parentId: id, childId: leafId, sortOrder: 0 }).run();
      return id;
    });
    const taskBRoot = db.transaction((tx) => {
      const id = tx.insert(nodes).values({ bingoId: bingo.id, kind: "ALL" }).returning().get().id;
      tx.insert(nodeEdges).values({ parentId: id, childId: leafId, sortOrder: 0 }).run();
      return id;
    });

    // Replace task A's tree to drop the shared leaf entirely.
    db.transaction((tx) => replaceSubtree(tx, taskARoot, bingo.id, { kind: "ALL", children: [{ kind: "MANUAL" }] }));

    // The leaf must survive — task B still points at it.
    expect(getNodeTree(db, taskBRoot)!.children[0]!.id).toBe(leafId);
  });
});

describe("a SUM holds only Items", () => {
  const sumWithCondition: GraphNodeInput = {
    kind: "SUM",
    label: "Page 1",
    quantity: 3,
    children: [{ kind: "ITEM", itemName: "Magic fang" }, { kind: "ALL", children: [{ kind: "ITEM", itemName: "Virtus mask" }] }],
  };

  it("refuses a condition inside a SUM when a tree is created, and writes nothing", () => {
    const bingo = seedBingo();
    expect(() => db.transaction((tx) => insertSubtree(tx, bingo.id, sumWithCondition))).toThrow(/"Page 1" \("N in total from"\) can only be made of Items/);
    expect(db.select().from(nodes).all()).toHaveLength(0);
  });

  it("refuses one when a tree is edited, keeping the old tree", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "SUM", quantity: 3, children: [{ kind: "ITEM", itemName: "Magic fang" }] }));
    expect(() => db.transaction((tx) => replaceSubtree(tx, rootId, bingo.id, sumWithCondition))).toThrow(/can only be made of Items/);
    expect(getNodeTree(db, rootId)!.children.map((c) => c.kind)).toEqual(["ITEM"]);
  });

  it("still allows a SUM of Items, including one nested in another condition", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) =>
      insertSubtree(tx, bingo.id, { kind: "ANY", children: [{ kind: "SUM", quantity: 2, children: [{ kind: "ITEM", itemName: "Magic fang" }, { kind: "ITEM", itemName: "Tanzanite fang" }] }] }),
    );
    expect(getNodeTree(db, rootId)!.children[0]!.kind).toBe("SUM");
  });
});

describe("Counts as", () => {
  const pages = (countsAs: unknown): GraphNodeInput => ({
    kind: "SUM",
    quantity: 200,
    children: [{ kind: "ITEM", itemName: "Burnt page" }, { kind: "ITEM", itemName: "Pyromancer garb", countsAs: countsAs as number }],
  });

  it("keeps an Item's Counts as, defaults it to 1, and hands it to the engine", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, pages(25)));
    expect(getNodeTree(db, rootId)!.children.map((c) => c.countsAs)).toEqual([1, 25]);
    expect(getNodeTree(db, rootId)!.countsAs).toBe(1);
    expect(getFullGraph(db, bingo.id).engineNodes.find((n) => n.itemName === "Pyromancer garb")!.countsAs).toBe(25);
  });

  it("changes it in place on an edit, keeping the Item's id", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, pages(25)));
    const before = getNodeTree(db, rootId)!;
    const garb = before.children[1]!;
    db.transaction((tx) =>
      replaceSubtree(tx, rootId, bingo.id, { id: rootId, kind: "SUM", quantity: 200, children: [{ id: before.children[0]!.id, kind: "ITEM", itemName: "Burnt page" }, { id: garb.id, kind: "ITEM", itemName: "Pyromancer garb", countsAs: 10 }] }),
    );
    const after = getNodeTree(db, rootId)!.children[1]!;
    expect(after).toMatchObject({ id: garb.id, countsAs: 10 });
  });

  it("refuses anything but a whole number from 1", () => {
    const bingo = seedBingo();
    for (const bad of [0, -1, 2.5, "3"]) {
      expect(() => db.transaction((tx) => insertSubtree(tx, bingo.id, pages(bad)))).toThrow(/Counts as must be a whole number of at least 1/);
    }
    expect(db.select().from(nodes).all()).toHaveLength(0);
  });

  it("stores 1 on anything that isn't an Item", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, { ...pages(25), countsAs: 5 }));
    expect(getNodeTree(db, rootId)!.countsAs).toBe(1);
  });
});

describe("deleteSubtree / deleteNode", () => {
  it("deleteSubtree removes every descendant not shared elsewhere", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ALL", children: [{ kind: "ITEM", itemName: "A" }, { kind: "ITEM", itemName: "B" }] }));
    db.transaction((tx) => deleteSubtree(tx, rootId));
    expect(db.select().from(nodes).all()).toHaveLength(0);
  });

  it("deleteNode removes one node and GCs its now-orphaned children", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ALL", children: [{ kind: "ALL", children: [{ kind: "ITEM", itemName: "A" }] }] }));
    const childId = getNodeTree(db, rootId)!.children[0]!.id;
    db.transaction((tx) => deleteNode(tx, childId));
    expect(getNodeTree(db, rootId)!.children).toHaveLength(0);
    expect(db.select().from(nodes).all()).toHaveLength(1); // only the root is left
  });
});

describe("presentation roots survive GC", () => {
  it("deleting a line does not delete the tile nodes it pointed at", () => {
    const bingo = seedBingo();
    const tileNodeId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ALL" }));
    const tile = db.insert(schema.tiles).values({ bingoId: bingo.id, nodeId: tileNodeId, name: "T", boardRow: 0, boardCol: 0 }).returning().get();
    const lineNodeId = db.transaction((tx) => {
      const id = tx.insert(nodes).values({ bingoId: bingo.id, kind: "ALL", points: 15 }).returning().get().id;
      tx.insert(nodeEdges).values({ parentId: id, childId: tileNodeId, sortOrder: 0 }).run();
      return id;
    });
    db.insert(schema.bingoLines).values({ bingoId: bingo.id, nodeId: lineNodeId, lineType: "row", lineIndex: 0 }).run();

    // Caller deletes the presentation row first (FK), then the node itself.
    db.delete(schema.bingoLines).where(eq(schema.bingoLines.nodeId, lineNodeId)).run();
    db.transaction((tx) => deleteSubtree(tx, lineNodeId));

    expect(db.select().from(nodes).where(eq(nodes.id, tileNodeId)).get()).toBeDefined();
    expect(db.select().from(schema.tiles).where(eq(schema.tiles.id, tile.id)).get()).toBeDefined();
  });
});

describe("getFullGraph / getApprovedClaims", () => {
  it("flattens the whole bingo's graph, including a node with no presentation row", () => {
    const bingo = seedBingo();
    db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ALL", label: "Bonus", points: 30, children: [{ kind: "ITEM", itemName: "X" }] }));
    const { engineNodes, childrenOf } = getFullGraph(db, bingo.id);
    expect(engineNodes).toHaveLength(2);
    const root = engineNodes.find((n) => n.kind === "ALL")!;
    expect(childrenOf.get(root.id)).toHaveLength(1);
  });

  it("getApprovedClaims only returns approved claims for the given team and bingo", () => {
    const bingo = seedBingo();
    const [user] = db.insert(schema.users).values({ discordId: "u1", discordUsername: "u1" }).returning().all();
    const [team] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: user.id, name: "T", codeword: "cw" }).returning().all();
    const leafId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ITEM", itemName: "A" }));

    const approved = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: user.id, status: "approved", reviewedAt: new Date() }).returning().get();
    db.insert(schema.claims).values({ submissionId: approved.id, nodeId: leafId, itemName: "A", quantity: 1 }).run();
    const pending = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: user.id, status: "pending" }).returning().get();
    db.insert(schema.claims).values({ submissionId: pending.id, nodeId: leafId, itemName: "A", quantity: 1 }).run();

    const result = getApprovedClaims(db, team.id, bingo.id);
    expect(result).toHaveLength(1);
    expect(result[0]!.reviewedAt).toBeInstanceOf(Date);
  });
});

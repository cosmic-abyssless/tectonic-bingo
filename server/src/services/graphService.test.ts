import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNodeInput } from "@bingo/shared";
import * as schema from "../db/schema";
import { itemGroupItems, itemGroups, nodeEdges, nodeItems, nodes, tileWildcards } from "../db/schema";
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
  it("builds a nested GraphNode, resolving inline names and item group items", () => {
    const bingo = seedBingo();
    const [group] = db.insert(itemGroups).values({ name: "Cerberus uniques" }).returning().all();
    db.insert(itemGroupItems).values({ groupId: group.id, itemName: "Jar of darkness" }).run();

    const input: GraphNodeInput = {
      kind: "ALL",
      label: "Part A",
      points: 25,
      children: [
        { kind: "ITEM", itemNames: ["Tanzanite fang"], quantity: 1 },
        { kind: "ITEM", itemGroupId: group.id, itemNames: ["Inline extra"] },
      ],
    };
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, input));
    const tree = getNodeTree(db, rootId)!;

    expect(tree.kind).toBe("ALL");
    expect(tree.label).toBe("Part A");
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0]!.itemNames).toEqual(["Tanzanite fang"]);
    expect(tree.children[0]!.acceptedItemNames).toEqual(["Tanzanite fang"]);
    const groupLeaf = tree.children[1]!;
    expect(groupLeaf.itemGroupName).toBe("Cerberus uniques");
    expect(groupLeaf.acceptedItemNames.sort()).toEqual(["Inline extra", "Jar of darkness"].sort());
  });

  it("preserves child order via sortOrder", () => {
    const bingo = seedBingo();
    const input: GraphNodeInput = { kind: "ALL", children: [{ kind: "ITEM", itemNames: ["A"] }, { kind: "ITEM", itemNames: ["B"] }, { kind: "ITEM", itemNames: ["C"] }] };
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, input));
    const tree = getNodeTree(db, rootId)!;
    expect(tree.children.map((c) => c.itemNames[0])).toEqual(["A", "B", "C"]);
  });

  it("nests a node reachable from two different roots under both (shared leaf)", () => {
    const bingo = seedBingo();
    const leafId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ITEM", itemNames: ["Shared"] }));
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
      insertSubtree(tx, bingo.id, { kind: "ALL", children: [{ kind: "ITEM", itemNames: ["Vorki"], quantity: 1 }] }),
    );
    const leafId = getNodeTree(db, rootId)!.children[0]!.id;

    db.transaction((tx) => replaceSubtree(tx, rootId, bingo.id, { kind: "ALL", children: [{ id: leafId, kind: "ITEM", itemNames: ["Vorki"], quantity: 2 }] }));

    const updated = getNodeTree(db, rootId)!;
    expect(updated.children[0]!.id).toBe(leafId); // same id — any claims on it are still valid
    expect(updated.children[0]!.quantity).toBe(2); // but its fields did update
  });

  it("drops a leaf not reused by the new input, and its item rows", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) =>
      insertSubtree(tx, bingo.id, { kind: "ALL", children: [{ kind: "ITEM", itemNames: ["A"] }, { kind: "ITEM", itemNames: ["B"] }] }),
    );
    const droppedLeafId = getNodeTree(db, rootId)!.children[0]!.id;

    db.transaction((tx) => replaceSubtree(tx, rootId, bingo.id, { kind: "ALL", children: [{ kind: "ITEM", itemNames: ["B"] }] }));

    expect(db.select().from(nodes).all().find((n) => n.id === droppedLeafId)).toBeUndefined();
    expect(getNodeTree(db, rootId)!.children).toHaveLength(1);
  });

  it("does not delete a leaf still referenced by another root (shared across two tasks)", () => {
    const bingo = seedBingo();
    const leafId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ITEM", itemNames: ["Shared"] }));
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

  it("nulls out tileWildcards.applicableNodeId for a deleted node", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ALL", children: [{ kind: "ITEM", itemNames: ["A"] }] }));
    const leafId = getNodeTree(db, rootId)!.children[0]!.id;
    const tile = db.insert(schema.tiles).values({ bingoId: bingo.id, nodeId: rootId, name: "T", boardRow: 0, boardCol: 0 }).returning().get();
    db.insert(tileWildcards).values({ tileId: tile.id, itemName: "Jar", applicableNodeId: leafId }).run();

    db.transaction((tx) => replaceSubtree(tx, rootId, bingo.id, { kind: "ALL", children: [] }));

    expect(db.select().from(tileWildcards).all()[0]!.applicableNodeId).toBeNull();
  });
});

describe("deleteSubtree / deleteNode", () => {
  it("deleteSubtree removes every descendant not shared elsewhere", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ALL", children: [{ kind: "ITEM", itemNames: ["A"] }, { kind: "ITEM", itemNames: ["B"] }] }));
    db.transaction((tx) => deleteSubtree(tx, rootId));
    expect(db.select().from(nodes).all()).toHaveLength(0);
    expect(db.select().from(nodeItems).all()).toHaveLength(0);
  });

  it("deleteNode removes one node and GCs its now-orphaned children", () => {
    const bingo = seedBingo();
    const rootId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ALL", children: [{ kind: "ALL", children: [{ kind: "ITEM", itemNames: ["A"] }] }] }));
    const childId = getNodeTree(db, rootId)!.children[0]!.id;
    db.transaction((tx) => deleteNode(tx, childId));
    expect(getNodeTree(db, rootId)!.children).toHaveLength(0);
    expect(db.select().from(nodes).all()).toHaveLength(1); // only the root is left
  });
});

describe("getFullGraph / getApprovedClaims", () => {
  it("flattens the whole bingo's graph, including a node with no presentation row", () => {
    const bingo = seedBingo();
    db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ALL", label: "Bonus", points: 30, children: [{ kind: "ITEM", itemNames: ["X"] }] }));
    const { engineNodes, childrenOf } = getFullGraph(db, bingo.id);
    expect(engineNodes).toHaveLength(2);
    const root = engineNodes.find((n) => n.kind === "ALL")!;
    expect(childrenOf.get(root.id)).toHaveLength(1);
  });

  it("getApprovedClaims only returns approved claims for the given team and bingo", () => {
    const bingo = seedBingo();
    const [user] = db.insert(schema.users).values({ discordId: "u1", discordUsername: "u1" }).returning().all();
    const [team] = db.insert(schema.teams).values({ bingoId: bingo.id, captainUserId: user.id, name: "T", codeword: "cw" }).returning().all();
    const leafId = db.transaction((tx) => insertSubtree(tx, bingo.id, { kind: "ITEM", itemNames: ["A"] }));

    const approved = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: user.id, status: "approved", reviewedAt: new Date() }).returning().get();
    db.insert(schema.claims).values({ submissionId: approved.id, nodeId: leafId, itemName: "A", quantity: 1 }).run();
    const pending = db.insert(schema.submissions).values({ teamId: team.id, submittedByUserId: user.id, status: "pending" }).returning().get();
    db.insert(schema.claims).values({ submissionId: pending.id, nodeId: leafId, itemName: "A", quantity: 1 }).run();

    const result = getApprovedClaims(db, team.id, bingo.id);
    expect(result).toHaveLength(1);
    expect(result[0]!.reviewedAt).toBeInstanceOf(Date);
  });
});

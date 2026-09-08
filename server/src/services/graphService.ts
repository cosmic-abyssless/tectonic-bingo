import { and, eq, inArray, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { GraphNode, GraphNodeInput } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, itemGroupItems, itemGroups, nodeEdges, nodeItems, nodes, submissions, tileWildcards } from "../db/schema";
import type { ApprovedClaim, EngineNode } from "./engine";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface TreeCtx {
  nodesById: Map<string, typeof nodes.$inferSelect>;
  edgesByParent: Map<string, { childId: string; sortOrder: number }[]>;
  itemsByNode: Map<string, string[]>;
  groupsById: Map<string, { id: string; name: string }>;
  groupItemsByGroup: Map<string, string[]>;
}

function toGraphNode(id: string, ctx: TreeCtx): GraphNode {
  const row = ctx.nodesById.get(id)!;
  const itemNames = ctx.itemsByNode.get(id) ?? [];
  const groupItemNames = row.itemGroupId ? ctx.groupItemsByGroup.get(row.itemGroupId) ?? [] : [];
  const childIds = (ctx.edgesByParent.get(id) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((e) => e.childId);
  return {
    id: row.id,
    bingoId: row.bingoId,
    kind: row.kind,
    label: row.label,
    description: row.description,
    notes: row.notes,
    points: row.points,
    minCount: row.minCount,
    quantity: row.quantity,
    distinctItems: row.distinctItems,
    itemGroupId: row.itemGroupId,
    itemGroupName: row.itemGroupId ? ctx.groupsById.get(row.itemGroupId)?.name ?? null : null,
    itemNames,
    acceptedItemNames: [...itemNames, ...groupItemNames],
    pointsGateNodeId: row.pointsGateNodeId,
    submitGateNodeId: row.submitGateNodeId,
    allowsPreLoad: row.allowsPreLoad,
    children: childIds.map((cid) => toGraphNode(cid, ctx)),
  };
}

// Batch-loads the full nested GraphNode for each root id (a tile's or line's
// node, typically), resolving item groups. Descendants are found by
// following edges from the roots — a node reachable from two different roots
// in the same call is loaded once and nested under both (shared leaf).
export function getNodeTrees(db: Queryable, rootIds: string[]): Map<string, GraphNode> {
  if (rootIds.length === 0) return new Map();

  const allIds = new Set<string>(rootIds);
  let frontier = rootIds;
  while (frontier.length > 0) {
    const rows = db.select({ childId: nodeEdges.childId }).from(nodeEdges).where(inArray(nodeEdges.parentId, frontier)).all();
    const next = rows.map((r) => r.childId).filter((id) => !allIds.has(id));
    next.forEach((id) => allIds.add(id));
    frontier = next;
  }
  const ids = [...allIds];

  const nodeRows = db.select().from(nodes).where(inArray(nodes.id, ids)).all();
  const edgeRows = db.select().from(nodeEdges).where(inArray(nodeEdges.parentId, ids)).all();
  const itemRows = db.select().from(nodeItems).where(inArray(nodeItems.nodeId, ids)).all();
  const groupIds = [...new Set(nodeRows.flatMap((r) => (r.itemGroupId ? [r.itemGroupId] : [])))];
  const groupRows = groupIds.length ? db.select().from(itemGroups).where(inArray(itemGroups.id, groupIds)).all() : [];
  const groupItemRows = groupIds.length ? db.select().from(itemGroupItems).where(inArray(itemGroupItems.groupId, groupIds)).all() : [];

  const edgesByParent = new Map<string, { childId: string; sortOrder: number }[]>();
  for (const e of edgeRows) {
    const list = edgesByParent.get(e.parentId) ?? [];
    list.push({ childId: e.childId, sortOrder: e.sortOrder });
    edgesByParent.set(e.parentId, list);
  }
  const itemsByNode = new Map<string, string[]>();
  for (const i of itemRows) {
    const list = itemsByNode.get(i.nodeId) ?? [];
    list.push(i.itemName);
    itemsByNode.set(i.nodeId, list);
  }
  const groupItemsByGroup = new Map<string, string[]>();
  for (const gi of groupItemRows) {
    const list = groupItemsByGroup.get(gi.groupId) ?? [];
    list.push(gi.itemName);
    groupItemsByGroup.set(gi.groupId, list);
  }
  const ctx: TreeCtx = {
    nodesById: new Map(nodeRows.map((r) => [r.id, r])),
    edgesByParent,
    itemsByNode,
    groupsById: new Map(groupRows.map((g) => [g.id, g])),
    groupItemsByGroup,
  };

  const result = new Map<string, GraphNode>();
  for (const rootId of rootIds) {
    if (ctx.nodesById.has(rootId)) result.set(rootId, toGraphNode(rootId, ctx));
  }
  return result;
}

export function getNodeTree(db: Queryable, rootId: string): GraphNode | undefined {
  return getNodeTrees(db, [rootId]).get(rootId);
}

// Every node in a bingo, flattened for the scoring engine (evaluateGraph
// needs the whole graph, not just what's reachable from tiles/lines — a
// standalone bonus node with no presentation row still scores).
export function getFullGraph(db: Queryable, bingoId: string): { engineNodes: EngineNode[]; childrenOf: Map<string, string[]>; nodesById: Map<string, EngineNode> } {
  const nodeRows = db.select().from(nodes).where(eq(nodes.bingoId, bingoId)).all();
  const ids = nodeRows.map((r) => r.id);
  const edgeRows = ids.length ? db.select().from(nodeEdges).where(inArray(nodeEdges.parentId, ids)).all() : [];
  const itemRows = ids.length ? db.select().from(nodeItems).where(inArray(nodeItems.nodeId, ids)).all() : [];
  const groupIds = [...new Set(nodeRows.flatMap((r) => (r.itemGroupId ? [r.itemGroupId] : [])))];
  const groupItemRows = groupIds.length ? db.select().from(itemGroupItems).where(inArray(itemGroupItems.groupId, groupIds)).all() : [];

  const itemsByNode = new Map<string, string[]>();
  for (const i of itemRows) {
    const list = itemsByNode.get(i.nodeId) ?? [];
    list.push(i.itemName);
    itemsByNode.set(i.nodeId, list);
  }
  const groupItemsByGroup = new Map<string, string[]>();
  for (const gi of groupItemRows) {
    const list = groupItemsByGroup.get(gi.groupId) ?? [];
    list.push(gi.itemName);
    groupItemsByGroup.set(gi.groupId, list);
  }

  const engineNodes: EngineNode[] = nodeRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    minCount: r.minCount,
    quantity: r.quantity,
    distinctItems: r.distinctItems,
    acceptedItemNames: [...(itemsByNode.get(r.id) ?? []), ...(r.itemGroupId ? groupItemsByGroup.get(r.itemGroupId) ?? [] : [])],
    points: r.points,
    pointsGateNodeId: r.pointsGateNodeId,
  }));

  const childrenOf = new Map<string, string[]>();
  for (const e of [...edgeRows].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = childrenOf.get(e.parentId) ?? [];
    list.push(e.childId);
    childrenOf.set(e.parentId, list);
  }

  return { engineNodes, childrenOf, nodesById: new Map(engineNodes.map((n) => [n.id, n])) };
}

// A team's approved claims across the whole bingo (the engine needs all of
// them at once — a leaf can be a descendant of several roots).
export function getApprovedClaims(db: Queryable, teamId: string, bingoId: string): ApprovedClaim[] {
  return db
    .select({ nodeId: claims.nodeId, itemName: claims.itemName, quantity: claims.quantity, wildcardId: claims.wildcardId, reviewedAt: submissions.reviewedAt })
    .from(claims)
    .innerJoin(submissions, eq(claims.submissionId, submissions.id))
    .innerJoin(nodes, eq(claims.nodeId, nodes.id))
    .where(and(eq(submissions.teamId, teamId), eq(submissions.status, "approved"), eq(nodes.bingoId, bingoId)))
    .all()
    .map((r) => ({ ...r, reviewedAt: r.reviewedAt! }));
}

// The leaf (ITEM/MANUAL) descendants of a node, per the flat graph shape
// getFullGraph returns. Used for submission-time validation (a claim must
// target a leaf) and gate checks.
export function leafDescendants(rootId: string, childrenOf: Map<string, string[]>, nodesById: Map<string, { kind: string }>): string[] {
  const node = nodesById.get(rootId);
  if (!node) return [];
  if (node.kind === "ITEM" || node.kind === "MANUAL") return [rootId];
  return (childrenOf.get(rootId) ?? []).flatMap((id) => leafDescendants(id, childrenOf, nodesById));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type NodeRow = typeof nodes.$inferInsert;

function nodeFields(bingoId: string, input: GraphNodeInput): Omit<NodeRow, "id"> {
  return {
    bingoId,
    kind: input.kind,
    label: input.label ?? null,
    description: input.description ?? null,
    notes: input.notes ?? null,
    points: input.points ?? 0,
    minCount: input.minCount ?? null,
    quantity: input.quantity ?? null,
    distinctItems: input.distinctItems ?? false,
    itemGroupId: input.itemGroupId ?? null,
    pointsGateNodeId: input.pointsGateNodeId ?? null,
    submitGateNodeId: input.submitGateNodeId ?? null,
    allowsPreLoad: input.allowsPreLoad ?? false,
  };
}

function replaceItemNames(tx: Tx, nodeId: string, itemNames: string[]): void {
  tx.delete(nodeItems).where(eq(nodeItems.nodeId, nodeId)).run();
  for (const itemName of itemNames) tx.insert(nodeItems).values({ nodeId, itemName }).run();
}

// Inserts a brand-new subtree (used for a freshly created tile/line/task with
// no prior existence). Honors input.id when the caller wants a specific id
// (e.g. keeping a tile's designated root id stable); otherwise the DB assigns one.
export function insertSubtree(tx: Tx, bingoId: string, input: GraphNodeInput): string {
  const values: NodeRow = { ...nodeFields(bingoId, input), ...(input.id ? { id: input.id } : {}) };
  const node = tx.insert(nodes).values(values).returning().get();
  replaceItemNames(tx, node.id, input.itemNames ?? []);
  (input.children ?? []).forEach((child, i) => {
    const childId = insertSubtree(tx, bingoId, child);
    tx.insert(nodeEdges).values({ parentId: node.id, childId, sortOrder: i }).run();
  });
  return node.id;
}

// Reconciles `input` onto the graph: a child whose `id` names an existing
// node is updated in place (so claims already pointing at it stay valid);
// anything else is created fresh. Every id touched (reused or new) is
// recorded in `touched` so the caller can garbage-collect what's left over.
function reconcileSubtree(tx: Tx, bingoId: string, input: GraphNodeInput, touched: Set<string>): string {
  const existing = input.id ? tx.select({ id: nodes.id }).from(nodes).where(eq(nodes.id, input.id)).get() : undefined;
  const id = existing ? existing.id : tx.insert(nodes).values({ ...nodeFields(bingoId, input), ...(input.id ? { id: input.id } : {}) }).returning().get().id;
  if (existing) tx.update(nodes).set(nodeFields(bingoId, input)).where(eq(nodes.id, id)).run();
  touched.add(id);
  replaceItemNames(tx, id, input.itemNames ?? []);

  tx.delete(nodeEdges).where(eq(nodeEdges.parentId, id)).run();
  (input.children ?? []).forEach((child, i) => {
    const childId = reconcileSubtree(tx, bingoId, child, touched);
    tx.insert(nodeEdges).values({ parentId: id, childId, sortOrder: i }).run();
  });
  return id;
}

function collectDescendants(tx: Tx, rootId: string): Set<string> {
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const rows = tx.select({ childId: nodeEdges.childId }).from(nodeEdges).where(inArray(nodeEdges.parentId, frontier)).all();
    const next = rows.map((r) => r.childId).filter((id) => !seen.has(id));
    next.forEach((id) => seen.add(id));
    frontier = next;
  }
  return seen;
}

// Unconditionally deletes `id` (edges, inline items, wildcard references),
// then recurses into its former children via deleteNodeIfOrphaned — so a
// child still reachable from elsewhere in the DAG (e.g. a leaf shared by two
// tasks) survives, and one that isn't is cleaned up too.
function deleteNodeForce(tx: Tx, id: string): void {
  const childIds = tx.select({ childId: nodeEdges.childId }).from(nodeEdges).where(eq(nodeEdges.parentId, id)).all().map((r) => r.childId);
  tx.delete(nodeEdges).where(or(eq(nodeEdges.parentId, id), eq(nodeEdges.childId, id))).run();
  tx.delete(nodeItems).where(eq(nodeItems.nodeId, id)).run();
  tx.update(tileWildcards).set({ applicableNodeId: null }).where(eq(tileWildcards.applicableNodeId, id)).run();
  tx.delete(nodes).where(eq(nodes.id, id)).run();
  for (const childId of childIds) deleteNodeIfOrphaned(tx, childId);
}

// Deletes `id` only if it has no remaining parent edge (a child still
// reachable from elsewhere in the DAG is kept). Used for GC after a subtree
// replace/delete — never call this on a node the caller means to remove
// outright (it has a parent by definition); use deleteNode/deleteSubtree.
function deleteNodeIfOrphaned(tx: Tx, id: string): void {
  const stillExists = tx.select({ id: nodes.id }).from(nodes).where(eq(nodes.id, id)).get();
  if (!stillExists) return;
  const hasParent = tx.select({ id: nodeEdges.id }).from(nodeEdges).where(eq(nodeEdges.childId, id)).get();
  if (hasParent) return;
  deleteNodeForce(tx, id);
}

// Replaces the subtree rooted at `rootNodeId` in place — the root's id never
// changes (tiles.nodeId/bingoLines.nodeId keep pointing at it). Descendants
// named by `id` in `input` are updated in place; everything else in the old
// subtree that isn't reused and isn't still referenced from elsewhere in the
// graph is deleted.
export function replaceSubtree(tx: Tx, rootNodeId: string, bingoId: string, input: GraphNodeInput): void {
  const before = collectDescendants(tx, rootNodeId);
  const touched = new Set<string>();
  reconcileSubtree(tx, bingoId, { ...input, id: rootNodeId }, touched);
  for (const id of before) {
    if (id === rootNodeId || touched.has(id)) continue;
    deleteNodeIfOrphaned(tx, id);
  }
}

// Deletes a subtree entirely (e.g. a tile is deleted). Same orphan-safety for
// its descendants as replaceSubtree's cleanup, just with nothing kept.
export function deleteSubtree(tx: Tx, rootNodeId: string): void {
  deleteNodeForce(tx, rootNodeId);
}

// Deletes one node (e.g. removing a single task from a tile) regardless of
// its current parent edge, and GCs any children left orphaned by that.
export function deleteNode(tx: Tx, nodeId: string): void {
  deleteNodeForce(tx, nodeId);
}

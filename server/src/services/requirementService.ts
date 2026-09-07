import { and, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { RequirementNode, RequirementNodeInput } from "@bingo/shared";
import * as schema from "../db/schema";
import { claims, itemGroupItems, itemGroups, requirementNodeItems, requirementNodes, submissions, tileWildcards } from "../db/schema";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

// The subset of RequirementNode that evaluation depends on.
export type EvaluableNode = Pick<RequirementNode, "id" | "kind" | "minCount" | "quantity" | "distinctItems" | "acceptedItemNames"> & {
  children: EvaluableNode[];
};

export interface ApprovedClaim {
  nodeId: string;
  itemName: string | null;
  quantity: number;
  wildcardId: string | null;
}

export type { RequirementNodeInput };

// Pure, DB-free evaluation: does this subtree hold given the team's approved
// claims? MANUAL leaves are decided by the mod on approval and passed in as
// `manualCompleted`.
export function evaluateNode(node: EvaluableNode, approved: ApprovedClaim[], manualCompleted = false): boolean {
  switch (node.kind) {
    case "MANUAL":
      return manualCompleted;
    case "ITEM": {
      const accepted = new Set(node.acceptedItemNames.map((n) => n.toLowerCase()));
      const mine = approved.filter(
        (c) => c.nodeId === node.id && (c.wildcardId !== null || (c.itemName !== null && accepted.has(c.itemName.toLowerCase()))),
      );
      const tally = node.distinctItems
        ? new Set(mine.map((c) => c.itemName?.toLowerCase() ?? `wildcard:${c.wildcardId}`)).size
        : mine.reduce((sum, c) => sum + c.quantity, 0);
      return tally >= (node.quantity ?? 1);
    }
    case "ALL":
      return node.children.every((c) => evaluateNode(c, approved, manualCompleted));
    case "ANY":
      return node.children.some((c) => evaluateNode(c, approved, manualCompleted));
    case "COUNT": {
      const satisfied = node.children.filter((c) => evaluateNode(c, approved, manualCompleted)).length;
      return satisfied >= (node.minCount ?? 1);
    }
  }
}

export function leafIds(node: EvaluableNode): string[] {
  if (node.kind === "ITEM" || node.kind === "MANUAL") return [node.id];
  return node.children.flatMap(leafIds);
}

export function getRequirementNodesForTasks(db: Queryable, taskIds: string[]) {
  if (taskIds.length === 0) return [];
  return db.select().from(requirementNodes).where(inArray(requirementNodes.taskId, taskIds)).orderBy(requirementNodes.sortOrder).all();
}

// Nested API shape (RequirementNode) for every task id, keyed by task. ITEM
// leaves come with their group's items resolved into acceptedItemNames.
export function getRequirementTrees(db: Queryable, taskIds: string[]): Map<string, RequirementNode> {
  const rows = getRequirementNodesForTasks(db, taskIds);
  const nodeIds = rows.map((r) => r.id);
  const inlineItems = nodeIds.length
    ? db.select().from(requirementNodeItems).where(inArray(requirementNodeItems.nodeId, nodeIds)).all()
    : [];
  const groupIds = [...new Set(rows.flatMap((r) => (r.itemGroupId ? [r.itemGroupId] : [])))];
  const groups = groupIds.length ? db.select().from(itemGroups).where(inArray(itemGroups.id, groupIds)).all() : [];
  const groupItems = groupIds.length
    ? db.select().from(itemGroupItems).where(inArray(itemGroupItems.groupId, groupIds)).all()
    : [];

  const nodes = new Map<string, RequirementNode>();
  for (const r of rows) {
    const itemNames = inlineItems.filter((i) => i.nodeId === r.id).map((i) => i.itemName);
    const groupNames = groupItems.filter((g) => g.groupId === r.itemGroupId).map((g) => g.itemName);
    nodes.set(r.id, {
      id: r.id,
      taskId: r.taskId,
      parentId: r.parentId,
      sortOrder: r.sortOrder,
      kind: r.kind,
      minCount: r.minCount,
      quantity: r.quantity,
      distinctItems: r.distinctItems,
      itemGroupId: r.itemGroupId,
      itemGroupName: groups.find((g) => g.id === r.itemGroupId)?.name ?? null,
      itemNames,
      acceptedItemNames: [...itemNames, ...groupNames],
      children: [],
    });
  }
  const roots = new Map<string, RequirementNode>();
  for (const node of nodes.values()) {
    if (node.parentId === null) roots.set(node.taskId, node);
    else nodes.get(node.parentId)!.children.push(node);
  }
  return roots;
}

export function getRequirementTree(db: Queryable, taskId: string): RequirementNode | undefined {
  return getRequirementTrees(db, [taskId]).get(taskId);
}

export function getApprovedClaimsForTask(db: Queryable, teamId: string, taskId: string): ApprovedClaim[] {
  return db
    .select({ nodeId: claims.nodeId, itemName: claims.itemName, quantity: claims.quantity, wildcardId: claims.wildcardId })
    .from(claims)
    .innerJoin(submissions, eq(claims.submissionId, submissions.id))
    .innerJoin(requirementNodes, eq(claims.nodeId, requirementNodes.id))
    .where(and(eq(submissions.teamId, teamId), eq(submissions.status, "approved"), eq(requirementNodes.taskId, taskId)))
    .all();
}

export function deleteRequirementTrees(db: Queryable, taskIds: string[]): void {
  if (taskIds.length === 0) return;
  const nodeIds = getRequirementNodesForTasks(db, taskIds).map((r) => r.id);
  if (nodeIds.length === 0) return;
  db.delete(requirementNodeItems).where(inArray(requirementNodeItems.nodeId, nodeIds)).run();
  db.update(tileWildcards).set({ applicableNodeId: null }).where(inArray(tileWildcards.applicableNodeId, nodeIds)).run();
  db.delete(requirementNodes).where(inArray(requirementNodes.id, nodeIds)).run();
}

export function replaceRequirementTree(db: Queryable, taskId: string, root: RequirementNodeInput): void {
  deleteRequirementTrees(db, [taskId]);

  const insert = (input: RequirementNodeInput, parentId: string | null, sortOrder: number) => {
    const node = db
      .insert(requirementNodes)
      .values({
        taskId,
        parentId,
        sortOrder,
        kind: input.kind,
        minCount: input.minCount ?? null,
        quantity: input.quantity ?? null,
        distinctItems: input.distinctItems ?? false,
        itemGroupId: input.itemGroupId ?? null,
      })
      .returning()
      .get();
    for (const itemName of input.itemNames ?? []) {
      db.insert(requirementNodeItems).values({ nodeId: node.id, itemName }).run();
    }
    (input.children ?? []).forEach((child, i) => insert(child, node.id, i));
  };
  insert(root, null, 0);
}

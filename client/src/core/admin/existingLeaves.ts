// "+ existing item" (RequirementTreeEditor): the ITEM leaves elsewhere on a Tile that another Task can link to, and what
// linking one sends. Linking shares the leaf itself (one node under two Tasks), and saving a Task rewrites a shared node
// from what it sends, so the link carries the leaf's own settings, its Counts as and Valued as (CONTEXT.md), or the save
// would clear them (#376).
import type { GraphNode, GraphNodeInput, ValuedAs } from "@bingo/shared";
import { collectLeaves } from "../board/requirementTree";

/** An ITEM leaf that already exists elsewhere on the same tile — offered as a reference, not retyped. */
export interface ExistingLeaf {
  id: string;
  itemName: string;
  /** Its Counts as (CONTEXT.md), sent along when it's linked in so the shared Item keeps it. */
  countsAs: number;
  /** Its Valued as (CONTEXT.md), likewise. */
  valuedAs: ValuedAs | null;
  taskLabel: string;
}

/** Every ITEM leaf on the tile's other Tasks (not the one at `excludeTaskIndex`), for "+ existing item". */
export function existingLeavesExcluding(tasks: GraphNode[], excludeTaskIndex: number): ExistingLeaf[] {
  return tasks
    .filter((_, i) => i !== excludeTaskIndex)
    .flatMap((task) =>
      collectLeaves(task)
        .filter((leaf) => leaf.kind === "ITEM" && leaf.itemName)
        .map((leaf) => ({ id: leaf.id, itemName: leaf.itemName!, countsAs: leaf.countsAs, valuedAs: leaf.valuedAs, taskLabel: task.label ?? "Task" })),
    );
}

/** What linking `leaf` in sends: the same node, by id, with its own settings, so the shared Item keeps them. */
export function linkedLeafInput(leaf: ExistingLeaf): GraphNodeInput {
  return { id: leaf.id, kind: "ITEM", itemName: leaf.itemName, countsAs: leaf.countsAs, valuedAs: leaf.valuedAs };
}

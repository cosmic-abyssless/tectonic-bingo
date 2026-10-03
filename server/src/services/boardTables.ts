// The two copies of a Bingo's Board (CONTEXT.md "Draft board", "Published board"): the same five tables, once for
// the Board everyone plays on and once for the Admins' working copy. boardService and graphService take one of these
// sets, so the same editing code writes either; everything that serves Players, Moderators, scoring or the export
// reads the Published set (the default everywhere).
import * as schema from "../db/schema";

export interface BoardTables {
  /** The Draft board: nothing here is seen by anyone but Admins, so its edits aren't audited one by one (Publish is). */
  draft: boolean;
  // Typed as the draft tables, the columns both copies have (the Published `nodes` adds removedAt).
  nodes: typeof schema.draftNodes;
  nodeEdges: typeof schema.draftNodeEdges;
  tiles: typeof schema.draftTiles;
  bingoLines: typeof schema.draftBingoLines;
  tileCategories: typeof schema.draftTileCategories;
}

export const PUBLISHED_BOARD: BoardTables = {
  draft: false,
  nodes: schema.nodes as unknown as typeof schema.draftNodes,
  nodeEdges: schema.nodeEdges as unknown as typeof schema.draftNodeEdges,
  tiles: schema.tiles as unknown as typeof schema.draftTiles,
  bingoLines: schema.bingoLines as unknown as typeof schema.draftBingoLines,
  tileCategories: schema.tileCategories as unknown as typeof schema.draftTileCategories,
};

export const DRAFT_BOARD: BoardTables = {
  draft: true,
  nodes: schema.draftNodes,
  nodeEdges: schema.draftNodeEdges,
  tiles: schema.draftTiles,
  bingoLines: schema.draftBingoLines,
  tileCategories: schema.draftTileCategories,
};

// The board's Tile search, matched in the browser: by a Tile's name, its Parts' descriptions, the Items in its
// requirements and its Tags (CONTEXT.md "Tag"), which the full board carries only for this. Every letter matches in the
// same frame it's typed, with no request to wait for. While the Tiles are sealed (CONTEXT.md "Sealed Tiles") a Tile is
// found by its name and Category only, and the sealed board has no Items, Parts or Tags anyway.
import { tagsMatchSearch, type GraphNode, type Tile, type TileCategory } from "@bingo/shared";

/** Whether a Tile matches what's typed (case-insensitive "contains"). */
export type TileMatcher = (tile: Tile, q: string) => boolean;

const NO_TAGS: readonly string[] = [];

function itemNames(node: GraphNode): string[] {
  return [...(node.kind === "ITEM" && node.itemName ? [node.itemName] : []), ...node.children.flatMap(itemNames)];
}

/** Whether a Tile matches `q` by its name, its Parts' descriptions, its Items or `tags` (its own and its Parts'). */
export function tileMatchesSearch(tile: Tile, q: string, tags: readonly string[] = NO_TAGS): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return false;
  if (tile.name.toLowerCase().includes(query)) return true;
  if (tagsMatchSearch(tags, query)) return true;
  return tile.node.children.some((part) => (part.description ?? "").toLowerCase().includes(query) || itemNames(part).some((n) => n.toLowerCase().includes(query)));
}

/** While the Tiles are sealed: a Tile's name or its Category's label only. */
export function sealedTileMatchesSearch(tile: Pick<Tile, "name">, categoryLabel: string | null, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return false;
  return tile.name.toLowerCase().includes(query) || (categoryLabel ?? "").toLowerCase().includes(query);
}

/** The board's matcher for this viewer: sealed or not, with the board's Tags (BoardResponse.tileTags) by Tile id. */
export function tileSearchMatcher(sealed: boolean, categories: readonly TileCategory[], tileTags: Readonly<Record<string, string[]>>): TileMatcher {
  if (sealed) {
    const labelById = new Map(categories.map((c) => [c.id, c.label]));
    return (tile, q) => sealedTileMatchesSearch(tile, tile.categoryId ? (labelById.get(tile.categoryId) ?? null) : null, q);
  }
  return (tile, q) => tileMatchesSearch(tile, q, tileTags[tile.id]);
}

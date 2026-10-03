// Tags (CONTEXT.md "Tag"): words the board's search finds a Tile by, on the Tile itself or on one of its Parts. Never
// shown to Players: only the board editor reads them, and a Player's search asks the server which Tiles a query's
// tags match (the answer is Tile ids, never the tags).

/** A Text tag is any text; a Boss tag is a boss from the OSRS Wiki, whose names for it come along as Text tags. */
export type TagKind = "text" | "boss";

/** The longest a tag can be, after trimming. */
export const TAG_MAX_LENGTH = 40;

export interface Tag {
  id: string;
  kind: TagKind;
  /** A Text tag's text, or a Boss tag's wiki page title ("Abyssal Sire"). */
  text: string;
  /** A Text tag a Boss tag added (one of the wiki's names for the boss): that Boss tag's id. Null otherwise. */
  bossTagId: string | null;
}

/** The board editor's tags: each Tile's and each Part's (by the Part's node id), in the order they were added. */
export interface BoardTagsResponse {
  tiles: Record<string, Tag[]>;
  parts: Record<string, Tag[]>;
}

/** What the board editor adds to a Tile or a Part: a Text tag, or a Boss tag by its wiki page title. */
export type AddTagRequest = { text: string } | { boss: string };

/** The Tiles a search query finds by their tags (or their Parts' tags). Empty while the Tiles are sealed. */
export interface TileTagSearchResponse {
  tileIds: string[];
}

/** A boss in the OSRS Wiki's Bosses category, as the board editor's boss picker lists it. */
export interface OsrsBossSearchResult {
  name: string;
  wikiUrl: string;
}

/** A tag as it's stored: trimmed. */
export function normalizeTagText(text: string): string {
  return text.trim();
}

/** Two tags are the same tag whatever their capitals. */
export function tagKey(text: string): string {
  return normalizeTagText(text).toLowerCase();
}

/** Whether any of these tags contains the query: case-insensitive "contains", like the rest of the board's search. */
export function tagsMatchSearch(texts: readonly string[], q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return false;
  return texts.some((text) => text.toLowerCase().includes(query));
}

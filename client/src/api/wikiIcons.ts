// URL of an item's OSRS wiki icon, served by our own cache (server/src/middleware/wikiIcons.ts)
// rather than the wiki, so players never hit the wiki and the icon is cached for
// a month. Returns undefined for a missing/blank name. Not every item name has an
// icon (bingo-specific labels, some pets), so callers must tolerate a 404 — see ItemIcon.
export function wikiIconUrl(name: string | null | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed ? `/wiki-icons/${encodeURIComponent(trimmed)}.png` : undefined;
}

// The item's OSRS wiki page, by way of the wiki's search: a name that is a page title goes straight to it, and one that
// isn't (a bingo-specific label like "Any Cerberus drop") lands on search results instead of a missing page.
export function wikiPageUrl(name: string): string {
  return `https://oldschool.runescape.wiki/?search=${encodeURIComponent(name.trim())}`;
}

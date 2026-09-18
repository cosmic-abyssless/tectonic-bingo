import { eq } from "drizzle-orm";
import { db } from "../db";
import { nodes } from "../db/schema";

// The item names the app actually uses — every ITEM leaf's accepted name, across
// all bingos. This is what gates the wiki icon cache: it will only ever ask the
// OSRS wiki about a name in this set, so an unauthenticated visitor can't make
// the server fetch arbitrary wiki files.

const TTL_MS = 60_000;
let cache: { at: number; names: Set<string> } | null = null;

export function getKnownItemNames(now = Date.now()): Set<string> {
  if (cache && now - cache.at < TTL_MS) return cache.names;
  const rows = db.selectDistinct({ name: nodes.itemName }).from(nodes).where(eq(nodes.kind, "ITEM")).all();
  const names = new Set<string>();
  for (const { name } of rows) {
    const trimmed = name?.trim();
    if (trimmed) names.add(trimmed);
  }
  cache = { at: now, names };
  return names;
}

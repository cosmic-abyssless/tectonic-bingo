import type { OsrsItemSearchResult } from "@bingo/shared";
import { api } from "./client";

export function searchOsrsItems(query: string) {
  return api.get<{ items: OsrsItemSearchResult[] }>(`/api/osrs-items/search?q=${encodeURIComponent(query)}`);
}

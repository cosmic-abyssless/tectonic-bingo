import type { TectonicProfile } from "@bingo/shared";

// Local copies of the clan rank icons (from the tectonic website), keyed by
// the rank slug tectonic-api uses for `tier.icon` when it isn't a URL/emoji.
const RANK_ICONS: Record<string, string> = import.meta.glob("../ui/icons/ranks/Clan_icon_-_*.png", { eager: true, import: "default", query: "?url" });

function rankIconBySlug(slug: string): string | null {
  const file = slug
    .split(/[-_ ]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("_");
  return Object.entries(RANK_ICONS).find(([path]) => path.endsWith(`Clan_icon_-_${file}.png`))?.[1] ?? null;
}

/** Mirrors the tectonic website's getRankIconUrl: URL as-is, Discord emoji → CDN, otherwise a rank slug. */
export function tierIconUrl(icon: string | null): string | null {
  if (!icon) return null;
  if (/^https?:\/\//.test(icon)) return icon;
  const emoji = icon.match(/<a?:.+?:(\d+)>/);
  if (emoji) return `https://cdn.discordapp.com/emojis/${emoji[1]}.${icon.startsWith("<a:") ? "gif" : "png"}`;
  return rankIconBySlug(icon);
}

/** "red_topaz" → "Red Topaz" */
export function formatTierName(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** OSRS game tick = 0.6s. "48.6" / "2:13.8" / "1:02:13.8". */
export function formatTicks(ticks: number): string {
  const total = ticks * 0.6;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total - h * 3600 - m * 60).toFixed(1).padStart(4, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${s}`;
  if (m > 0) return `${m}:${s}`;
  return s.replace(/^0/, "");
}

export function formatRecordValue(value: number, valueType: string): string {
  return valueType === "time" ? formatTicks(value) : value.toLocaleString();
}

export const isBingoEvent = (e: { name: string; solo: boolean }) => !e.solo && /bingo/i.test(e.name);

function placeCounts(places: number[]) {
  const count = (place: number) => places.filter((p) => p === place).length;
  return { total: places.length, first: count(1), second: count(2), third: count(3) };
}

/** How many of the player's held clan records sit at #1 / #2 / #3. */
export function recordSummary(profile: TectonicProfile) {
  return placeCounts(profile.records.map((r) => r.position));
}

export function recordTitle(profile: TectonicProfile): string {
  const r = recordSummary(profile);
  return `${r.first}× #1 · ${r.second}× #2 · ${r.third}× #3`;
}

/** Placement counts for the scored events, split out so the table can show "3 podiums" with a breakdown tooltip. */
export function podiumSummary(profile: TectonicProfile) {
  return { ...placeCounts(profile.events.map((e) => e.placement)), bingoWins: profile.events.filter((e) => e.placement === 1 && isBingoEvent(e)).length };
}

export function podiumTitle(profile: TectonicProfile): string {
  const p = podiumSummary(profile);
  const parts = [`${p.first}× 1st`, `${p.second}× 2nd`, `${p.third}× 3rd`];
  if (p.bingoWins > 0) parts.push(`${p.bingoWins} bingo win${p.bingoWins === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

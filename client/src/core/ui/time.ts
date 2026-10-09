/** "2 days 3 hours" style duration, for countdowns. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0 seconds";
  const totalSeconds = Math.floor(ms / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} day${d !== 1 ? "s" : ""}`);
  if (h > 0) parts.push(`${h} hour${h !== 1 ? "s" : ""}`);
  if (m > 0) parts.push(`${m} minute${m !== 1 ? "s" : ""}`);
  if (parts.length === 0) parts.push(`${s} second${s !== 1 ? "s" : ""}`);
  return parts.join(" ");
}

/** "6d 23h" style duration: the two largest units, for a countdown with little room (a phone header). */
export function formatShortDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const units: [number, string][] = [
    [Math.floor(totalSeconds / 86400), "d"],
    [Math.floor((totalSeconds % 86400) / 3600), "h"],
    [Math.floor((totalSeconds % 3600) / 60), "m"],
    [totalSeconds % 60, "s"],
  ];
  const first = units.findIndex(([n]) => n > 0);
  return units
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, u]) => `${n}${u}`)
    .join(" ");
}

/** "H:MM:SS" style countdown, for freeze timers. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "9:05" style minutes and seconds, for the last minutes of a countdown (the Bingo's start). */
export function formatMinutesSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/**
 * "Thu, Oct 8, 8:02 PM EDT": a moment in the viewer's own time zone, named, so it reads as their local time. `timeZone`
 * is for tests; the page always uses the browser's.
 */
export function formatLocalDateTime(ms: number, locale?: string, timeZone?: string): string {
  return new Date(ms).toLocaleString(locale, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone });
}

/** "3m ago" / "2h ago" / "5d ago" — the one copy (v1 had this in three files). */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

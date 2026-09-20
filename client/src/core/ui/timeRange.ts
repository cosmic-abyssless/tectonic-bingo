// A time window for filtering lists (the audit log): an optional start and end as ISO timestamps. Either side may be
// open. The pure parts live here so the date-string handling is testable; see DateTimeRangeFilter for the control.

export interface TimeRange {
  since?: string;
  until?: string;
}

export type RangePreset = "hour" | "day" | "week" | "month";

export const RANGE_PRESETS: { key: RangePreset; label: string; ms: number }[] = [
  { key: "hour", label: "Last hour", ms: 60 * 60_000 },
  { key: "day", label: "Last 24 hours", ms: 24 * 60 * 60_000 },
  { key: "week", label: "Last 7 days", ms: 7 * 24 * 60 * 60_000 },
  { key: "month", label: "Last 30 days", ms: 30 * 24 * 60 * 60_000 },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** An ISO timestamp as the local "YYYY-MM-DDTHH:mm" a datetime-local input expects ("" when unset or invalid). */
export function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A datetime-local value (the viewer's local time) back to an ISO timestamp, or undefined when empty or invalid.
 * The inputs only go down to the minute, so the end of a range runs to the end of that minute, not the start of it.
 */
export function fromLocalInput(value: string, edge: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Date(d.getTime() + (edge === "end" ? 59_999 : 0)).toISOString();
}

/** "The last hour / day / …" as a fixed window from `now` (the end stays open, so it means "up to the present"). */
export function presetRange(preset: RangePreset, now: Date): TimeRange {
  const { ms } = RANGE_PRESETS.find((p) => p.key === preset)!;
  return { since: new Date(now.getTime() - ms).toISOString() };
}

export const isRangeSet = (range: TimeRange) => !!range.since || !!range.until;

/** The start is after the end, so nothing can match. */
export function isInverted(range: TimeRange): boolean {
  return !!range.since && !!range.until && new Date(range.since).getTime() > new Date(range.until).getTime();
}

function formatMoment(iso: string, now: Date): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}), hour: "numeric", minute: "2-digit" });
}

/** Short description of the window for the filter button: "Any time", "Since Sep 20, 2:00 PM", "Sep 20, 2:00 PM – Sep 21, 9:00 AM". */
export function rangeSummary(range: TimeRange, now: Date = new Date()): string {
  if (!range.since && !range.until) return "Any time";
  if (range.since && range.until) return `${formatMoment(range.since, now)} – ${formatMoment(range.until, now)}`;
  if (range.since) return `Since ${formatMoment(range.since, now)}`;
  return `Until ${formatMoment(range.until!, now)}`;
}

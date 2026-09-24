import { timeAgo } from "../ui/time";

export type TimeFormat = "clock" | "sinceStart" | "ago" | "full";

export const TIME_FORMAT_OPTIONS: { key: TimeFormat; label: string }[] = [
  { key: "clock", label: "Clock" },
  { key: "sinceStart", label: "Since start" },
  { key: "ago", label: "Ago" },
  { key: "full", label: "Full date" },
];

/** "D2 +5h12m": the day of the bingo, then hours and minutes into it. Before the start reads as "Before start". */
export function sinceStart(at: Date, start: Date): string {
  const ms = at.getTime() - start.getTime();
  if (ms < 0) return "Before start";
  const totalMinutes = Math.floor(ms / 60_000);
  const day = Math.floor(totalMinutes / 1440) + 1;
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  return `D${day} +${h}h${String(m).padStart(2, "0")}m`;
}

/** The timeline's short time: "Sat 14:32" (clock), "D2 +5h12m", "3h ago" or "21 Sep 2026, 14:32". */
export function formatEventTime(iso: string, format: TimeFormat, start: string | null): string {
  const at = new Date(iso);
  switch (format) {
    case "clock":
      return at.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
    case "sinceStart":
      return start ? sinceStart(at, new Date(start)) : at.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
    case "ago":
      return timeAgo(iso);
    case "full":
      return at.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
}

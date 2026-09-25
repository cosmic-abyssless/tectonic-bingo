// A request's device-local time (CONTEXT.md "Achievement" > time of day): the client sends its IANA time zone in
// the X-Client-Timezone header (see audit/middleware.ts, which stores it on the request's AuditContext); a missing
// or invalid one falls back to UTC. Spoofable, and that's fine — it only ever decides an Achievement.
const DEFAULT_TIMEZONE = "UTC";

/** A bad or missing zone name reads as UTC — never throws. */
export function normalizeTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    // eslint-disable-next-line no-new -- constructing it is the validation; a bad zone name throws.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export interface LocalTime {
  /** YYYY-MM-DD in the given zone. */
  date: string;
  /** 0-23 in the given zone. */
  hour: number;
}

/** `at`'s device-local date and hour in `timezone` (already normalized by normalizeTimezone if it came from a client). */
export function localTimeOf(at: Date, timezone: string): LocalTime {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(at);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // ICU renders midnight as "24" with hour12: false in some environments
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour };
}

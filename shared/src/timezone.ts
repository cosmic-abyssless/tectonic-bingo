// A signup's timezone: an IANA zone name ("America/New_York"), asked of every player on the signup form and
// pre-filled from the browser. Pure Intl, so the server (validation) and the client (picker, labels) share it.

/** Whether `tz` is a zone name Intl accepts (IANA names and their aliases, e.g. "Asia/Calcutta" as well as "Asia/Kolkata"). */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The browser's (or server's) own zone, or null if the runtime can't say. */
export function detectTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isValidTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

// Both styles are ES2021 (and supportedValuesOf ES2022) — every browser and Node version this app runs on has them,
// but the ES2020 lib these packages compile against doesn't declare them, hence the casts.
function zoneNamePart(tz: string, style: "longOffset" | "longGeneric", at: Date): string {
  const options = { timeZone: tz, timeZoneName: style } as unknown as Intl.DateTimeFormatOptions;
  return new Intl.DateTimeFormat("en-US", options).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** "UTC−04:00" (right now — so it follows daylight saving), "UTC" for a zero offset. */
export function timeZoneOffsetLabel(tz: string, at: Date = new Date()): string {
  const gmt = zoneNamePart(tz, "longOffset", at); // "GMT-04:00", or "GMT" at zero
  return gmt === "GMT" ? "UTC" : gmt.replace("GMT", "UTC").replace("-", "−");
}

/** Minutes east of UTC right now, for sorting west to east. */
export function timeZoneOffsetMinutes(tz: string, at: Date = new Date()): number {
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(zoneNamePart(tz, "longOffset", at));
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** "New York" from "America/New_York", "Argentina/Buenos Aires" from "America/Argentina/Buenos_Aires". */
function placeName(tz: string): string {
  const parts = tz.split("/");
  return (parts.length > 1 ? parts.slice(1) : parts).join("/").split("_").join(" ");
}

// Each English locale only knows letter abbreviations for its own region's zones (en-US has EDT but calls London
// "GMT+1"; en-GB has BST and CEST but calls New York "GMT-4"), so ask each in turn and take the first real one.
const ABBREVIATION_LOCALES = ["en-US", "en-GB", "en-AU", "en-IN", "en-NZ"];

/**
 * The zone's abbreviation right now ("EDT" in summer, "EST" in winter; "BST", "CEST", "AEST"), or null where no
 * English locale has one (Jerusalem, Tokyo: Intl only offers "GMT+3"-style text there).
 */
export function timeZoneAbbreviation(tz: string, at: Date = new Date()): string | null {
  for (const locale of ABBREVIATION_LOCALES) {
    const name = new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
    if (name && !/^(GMT|UTC)[+-−]/.test(name)) return name;
  }
  return null;
}

/** How a zone is shown in tables: "EDT (UTC−04:00)", or the city where there's no abbreviation ("Tokyo (UTC+09:00)"). */
export function formatTimeZone(tz: string, at: Date = new Date()): string {
  if (!isValidTimeZone(tz)) return tz;
  const offset = timeZoneOffsetLabel(tz, at);
  const name = timeZoneAbbreviation(tz, at) ?? placeName(tz);
  return name === offset ? offset : `${name} (${offset})`;
}

export interface TimeZoneOption {
  id: string;
  /** "(UTC−04:00) New York — Eastern Time · America/New_York": searchable by city, zone name, region or offset. */
  label: string;
}

/**
 * Every zone the runtime knows, west to east, labelled for a searchable picker. `include` adds a zone missing from
 * the list (a saved alias like "Asia/Calcutta", or a browser zone the list leaves out) so it can still be selected.
 */
export function timeZoneOptions(include: (string | null | undefined)[] = [], at: Date = new Date()): TimeZoneOption[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: "timeZone") => string[] };
  const ids = new Set<string>(intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : []);
  for (const tz of include) if (tz && isValidTimeZone(tz)) ids.add(tz);
  return [...ids]
    .map((id) => ({ id, offset: timeZoneOffsetMinutes(id, at) }))
    .sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id))
    .map(({ id }) => {
      const generic = zoneNamePart(id, "longGeneric", at);
      // longGeneric falls back to "GMT+05:30"-style text where a zone has no English name — not worth repeating.
      const region = generic && !generic.startsWith("GMT") ? ` — ${generic}` : "";
      return { id, label: `(${timeZoneOffsetLabel(id, at)}) ${placeName(id)}${region} · ${id}` };
    });
}

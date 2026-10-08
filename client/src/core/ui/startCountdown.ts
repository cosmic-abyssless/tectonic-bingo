// The countdown to a Bingo's start, as the banner above the Board shows it (the PreStartBanner slot): the rules both
// themes draw it by.

/** The last minutes before the start, when the countdown becomes a big minutes-and-seconds clock. */
export const FINAL_STRETCH_MS = 10 * 60_000;

export interface CountdownUnit {
  value: number;
  /** "DAY"/"DAYS", "HR"/"HRS", "MIN". */
  label: string;
}

/**
 * The time left as up to three units from the largest that isn't zero, minutes always last: "1 DAY 17 HRS 58 MIN",
 * "3 HRS 0 MIN", "42 MIN". Rounded down to the minute, as the countdown it replaces was.
 */
export function countdownUnits(ms: number): CountdownUnit[] {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const units: CountdownUnit[] = [];
  if (days > 0) units.push({ value: days, label: days === 1 ? "DAY" : "DAYS" });
  if (days > 0 || hours > 0) units.push({ value: hours, label: hours === 1 ? "HR" : "HRS" });
  units.push({ value: minutes, label: "MIN" });
  return units;
}

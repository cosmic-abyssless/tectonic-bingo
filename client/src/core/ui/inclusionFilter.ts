/**
 * Kept in place of the picks when every option is picked, so All stays All when an option turns up later (a Team's or
 * Player's first Submission, Not reviewed once one is pending). Stored as the option keys themselves, the new option
 * wouldn't be among them, and All would quietly become a filter that hides it.
 */
export const ALL = "all";

/** What to keep for these picks: ALL when they're every option (see ALL), else the picks. */
export function storedPicks(keys: string[], options: { key: string }[]): string[] {
  return options.length > 0 && options.every((o) => keys.includes(o.key)) ? [ALL] : keys;
}

// A checklist filter stored as what's picked. Nothing picked means Any, and so does everything picked (All): every
// option, including ones that turn up later (a new team, a new user) or aren't listed. `query` is undefined while it's
// Any, ready to pass straight to an API filter.
export function inclusionFilter(selected: Set<string>, options: { key: string }[]) {
  const all = selected.has(ALL);
  const checked = options.map((o) => o.key).filter((key) => all || selected.has(key));
  const narrowed = !all && checked.length > 0 && checked.length < options.length;
  return {
    checked,
    query: narrowed ? checked : undefined,
    narrowed,
    /** Whether a row with this key passes: anything while it's Any, else only what's picked. */
    matches: (key: string) => !narrowed || checked.includes(key),
  };
}

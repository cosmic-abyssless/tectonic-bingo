// A checklist filter stored as what's picked. Nothing picked means Any: every option, including ones that turn up
// later (a new team, a new user). `query` is undefined while it's Any, ready to pass straight to an API filter.
export function inclusionFilter(selected: Set<string>, options: { key: string }[]) {
  const checked = options.map((o) => o.key).filter((key) => selected.has(key));
  const narrowed = checked.length > 0;
  return {
    checked,
    query: narrowed ? checked : undefined,
    narrowed,
    /** Whether a row with this key passes: anything while it's Any, else only what's picked. */
    matches: (key: string) => !narrowed || checked.includes(key),
  };
}

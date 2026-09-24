// A checklist filter stored as what's excluded, so options that appear later (a new team, a new user) start
// checked. `query` is undefined when nothing is narrowed, ready to pass straight to an API filter.
export function inclusionFilter(excluded: Set<string>, options: { key: string }[]) {
  const checked = options.map((o) => o.key).filter((key) => !excluded.has(key));
  const narrowed = checked.length < options.length;
  return {
    checked,
    query: narrowed && checked.length > 0 ? checked : undefined,
    none: options.length > 0 && checked.length === 0,
    narrowed,
  };
}

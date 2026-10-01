// The pure parts of keeping UI state in the URL's query params (useUrlParam.ts holds the hooks), so they're testable.

/** Param changes to make together: a value sets it, null removes it. */
export type UrlParamChanges = Record<string, string | null>;

/** `prev` with `changes` applied, as a new URLSearchParams. */
export function withParams(prev: URLSearchParams, changes: UrlParamChanges): URLSearchParams {
  const next = new URLSearchParams(prev);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) next.delete(name);
    else next.set(name, value);
  }
  return next;
}

/** A comma list from the URL as a set: `fallback` while the param is absent, nothing picked when it's empty. */
export function parseUrlSet(value: string | null, fallback: readonly string[]): Set<string> {
  if (value === null) return new Set(fallback);
  return new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
}

/** A set as its URL value: null (left out) when it's the default, else a comma list (empty when nothing is picked). */
export function serializeUrlSet(values: Iterable<string>, fallback: readonly string[]): string | null {
  const list = [...new Set(values)];
  const isDefault = list.length === fallback.length && fallback.every((v) => list.includes(v));
  return isDefault ? null : list.join(",");
}

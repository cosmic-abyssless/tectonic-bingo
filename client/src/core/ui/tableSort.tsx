import { useState, type ThHTMLAttributes } from "react";
import { Truncate } from "./tableChrome";

export type SortDir = "asc" | "desc";

export interface TableSort<K extends string> {
  key: K;
  dir: SortDir;
  toggle: (key: K) => void;
  /** Applies the current direction to a comparison result. */
  order: (cmp: number) => number;
}

// Clicking a new column sorts ascending; clicking the active one flips it.
export function useTableSort<K extends string>(defaultKey: K, defaultDir: SortDir = "asc"): TableSort<K> {
  const [key, setKey] = useState<K>(defaultKey);
  const [dir, setDir] = useState<SortDir>(defaultDir);

  function toggle(next: K) {
    if (next === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(next);
      setDir("asc");
    }
  }

  return { key, dir, toggle, order: (cmp) => (dir === "asc" ? cmp : -cmp) };
}

// Numeric columns must sort numerically, not with localeCompare (which
// would put "100" before "9" — string-lexicographic order, not magnitude).
export function compareSortValues(va: string | number, vb: string | number): number {
  return typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  className = "",
  thProps,
  labelMaxWidth,
}: {
  label: string;
  sortKey: K;
  sort: TableSort<K>;
  className?: string;
  /** Extra props spread onto the <th> — a sticky offset style, drag-and-drop handlers, etc. Optional, additive. */
  thProps?: ThHTMLAttributes<HTMLTableCellElement>;
  /** Caps the label's own width, truncating it with a tooltip for the full text — a custom signup question's prompt can run much longer than any other column's header. */
  labelMaxWidth?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      {...thProps}
      className={`py-2.5 pr-4 whitespace-nowrap text-left text-xs font-medium uppercase tracking-wide ${className} ${thProps?.className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => sort.toggle(sortKey)}
        className={`inline-flex items-center gap-1 select-none transition-colors hover:text-on-surface ${active ? "text-on-surface" : "text-on-surface-subtle"}`}
      >
        {labelMaxWidth ? (
          <Truncate title={label} maxWidth={labelMaxWidth}>
            {label}
          </Truncate>
        ) : (
          label
        )}
        {active && <span>{sort.dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

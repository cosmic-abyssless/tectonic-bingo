// Search across every column of a data table (issue #112), not just the
// ones currently visible — a mod might search on something in a column
// they've hidden. Each table supplies, per row, the plain-text values of
// every column (rendered or not) to search against.
import { useState } from "react";
import { Input } from "./Field";
import { IconButton } from "./Button";
import { SearchIcon, XIcon } from "./icons";

/** True if `query` appears, case-insensitively, in any of `haystack`. Blank query always matches (nothing is filtered). */
export function matchesSearch(haystack: readonly (string | number | null | undefined)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((v) => v != null && String(v).toLowerCase().includes(q));
}

// Escapes the query for use inside a RegExp — a search box takes literal
// text, not a pattern, so a stray `(` or `*` must not throw or change what
// matches.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `text` with every case-insensitive occurrence of `query` wrapped in <mark>. Renders `text` plain when `query` is blank. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded-xs bg-accent/30 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function TableSearchInput({
  value,
  onChange,
  placeholder = "Search…",
  matchCount,
  totalCount,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Shown as "N of total" once there's a query; omit to show nothing. */
  matchCount?: number;
  totalCount?: number;
}) {
  return (
    <div className="relative">
      <SearchIcon size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-on-surface-subtle" />
      <Input
        size="sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="w-56 pl-8 pr-16"
      />
      <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
        {value && matchCount !== undefined && totalCount !== undefined && (
          <span className="num text-xs text-on-surface-subtle">
            {matchCount} of {totalCount}
          </span>
        )}
        {value && (
          <IconButton label="Clear search" size="sm" onPress={() => onChange("")}>
            <XIcon size={12} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

export function useTableSearch(): [string, (next: string) => void] {
  const [query, setQuery] = useState("");
  return [query, setQuery];
}

import { useEffect, useMemo, useState } from "react";
import type { ItemGroup, OsrsItemSearchResult } from "@bingo/shared";
import { searchOsrsItems } from "../../api/osrsItemsApi";
import { controlClass } from "./Field";
import { LayersIcon } from "./icons";
import { SearchCombo } from "./SearchCombo";

// Mirrors osrsWikiService.ts's iconUrlFor — the wiki's real upload
// convention for an item's small inventory-sprite icon (title with spaces
// as underscores). Constructed client-side, with no search/lookup call,
// so a closed field can show an icon for whatever text it already holds
// (an existing item loaded from the DB, not just one picked this session)
// — the <img>'s onError hides it for text that isn't a real item name.
export function iconUrlFor(name: string): string {
  return `https://oldschool.runescape.wiki/images/${encodeURIComponent(name.trim().replace(/ /g, "_"))}.png`;
}

type Suggestion = { kind: "item"; item: OsrsItemSearchResult } | { kind: "group"; group: ItemGroup };

// A plain controlled text input augmented with OSRS Wiki item suggestions
// (name + icon) as the admin types — a drop-in for any "item name" text
// field. Freeform text always stays valid and is never overwritten except
// by an explicit suggestion pick: plenty of item names in this app (e.g.
// "Any Cerberus drop", "Waves 1-3 proof") are bingo-specific labels, not
// real OSRS items, and won't have wiki matches at all.
//
// When `itemGroups` is passed, matching groups are folded into the same
// dropdown (name-substring match, no request needed) so one search box picks
// either a single item or a whole reusable group — picking a group calls
// `onPickGroup` instead of committing a name.
export function ItemSearchInput({
  value,
  onChange,
  onCommit,
  onPickItem,
  itemGroups,
  onPickGroup,
  placeholder,
  className,
  containerClassName,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /**
   * Fires on blur with whatever freeform text is in the field — not on every
   * keystroke, to avoid a request per character. Optional — a caller that
   * persists via its own separate "Add" action has no use for this.
   */
  onCommit?: (value: string) => void;
  /** Fires when an item suggestion is picked (a deliberate, final choice — no blur needed). */
  onPickItem?: (name: string) => void;
  /** Groups searched by name alongside wiki items. Omit to search items only. */
  itemGroups?: ItemGroup[];
  /** Fires when a group suggestion is picked, instead of onCommit. */
  onPickGroup?: (group: ItemGroup) => void;
  placeholder?: string;
  className?: string;
  /** Applied to the wrapping (relative-positioned) div — set this, not `className`, to control layout/sizing (e.g. "flex-1") in a flex row. */
  containerClassName?: string;
  ariaLabel?: string;
}) {
  // The query the current item results are for: results for anything else are on their way (or stale).
  const [itemResults, setItemResults] = useState<{ query: string; items: OsrsItemSearchResult[] }>({ query: "", items: [] });
  const [focused, setFocused] = useState(false);
  // Typed in since the field was focused: only then is it searched, so focusing a filled field doesn't pop a list.
  const [typed, setTyped] = useState(false);
  // Whether the icon derived from the current value failed to load (not a
  // real item name, or no icon on the wiki). Reset whenever value changes
  // so switching to a different, valid name gets a fresh attempt.
  const [iconFailed, setIconFailed] = useState(false);
  useEffect(() => setIconFailed(false), [value]);
  // Shown only while the field is closed (not actively being typed into) —
  // while open, the dropdown's own per-result icons already show what's
  // relevant, and re-deriving this on every keystroke would fire a failed
  // image request for nearly every partial string typed.
  const closedIconUrl = !focused && value.trim() && !iconFailed ? iconUrlFor(value) : null;

  const query = value.trim();
  const searching = focused && typed && query.length >= 2;

  // Debounced search — fires on every value change while the field is
  // focused, not just on an explicit "search" action, so results feel live.
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchOsrsItems(query)
        .then((res) => {
          if (!cancelled) setItemResults({ query, items: res.items });
        })
        .catch(() => {
          if (!cancelled) setItemResults({ query, items: [] });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searching]);

  // Group matches are a pure in-memory name filter — no debounce needed.
  const matchedGroups = useMemo(() => {
    if (!searching || !itemGroups?.length) return [];
    const q = query.toLowerCase();
    return itemGroups.filter((g) => g.name.toLowerCase().includes(q));
  }, [itemGroups, query, searching]);

  const itemsFresh = itemResults.query === query;
  const suggestions: Suggestion[] = useMemo(
    () => [
      ...matchedGroups.map((group) => ({ kind: "group" as const, group })),
      ...(searching && itemsFresh ? itemResults.items.map((item) => ({ kind: "item" as const, item })) : []),
    ],
    [matchedGroups, itemResults, itemsFresh, searching],
  );

  const pick = (s: Suggestion) => {
    // Clear rather than fill the field: a pick is final, so leaving the name
    // in place would only make the blur re-commit it. The field stays focused,
    // so the very next keystroke searches again.
    onChange("");
    if (s.kind === "item") onPickItem?.(s.item.name);
    else onPickGroup?.(s.group);
  };

  return (
    <SearchCombo
      items={suggestions}
      itemKey={(s) => (s.kind === "item" ? `item:${s.item.name}` : `group:${s.group.id}`)}
      itemText={(s) => (s.kind === "item" ? s.item.name : s.group.name)}
      renderItem={(s, { isFocused }) =>
        s.kind === "item" ? (
          <>
            <img
              src={s.item.iconUrl}
              alt=""
              className="size-5 shrink-0 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = "hidden";
              }}
            />
            <span className="truncate">{s.item.name}</span>
          </>
        ) : (
          <>
            <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden>
              <LayersIcon size={14} />
            </span>
            <span className="truncate">{s.group.name}</span>
            <span className={`num ml-auto shrink-0 text-xs ${isFocused ? "text-on-accent/70" : "text-on-surface-subtle"}`}>group · {s.group.itemNames.length}</span>
          </>
        )
      }
      onPick={pick}
      inputValue={value}
      onInputChange={(v) => {
        setTyped(true);
        onChange(v);
      }}
      loading={searching && !itemsFresh}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={containerClassName}
      inputClassName={`${className ?? controlClass()} ${closedIconUrl ? "pl-8" : ""}`}
      minListWidth={220}
      onFocus={() => {
        setFocused(true);
        setTyped(false);
      }}
      onBlur={() => {
        setFocused(false);
        onCommit?.(value);
      }}
    >
      {closedIconUrl && (
        <img
          src={closedIconUrl}
          alt=""
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 object-contain"
          onError={() => setIconFailed(true)}
        />
      )}
    </SearchCombo>
  );
}

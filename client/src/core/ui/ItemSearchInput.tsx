import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemGroup, OsrsItemSearchResult } from "@bingo/shared";
import { searchOsrsItems } from "../../api/osrsItemsApi";
import { controlClass } from "./Field";
import { LayersIcon } from "./icons";

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
  const [itemResults, setItemResults] = useState<OsrsItemSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  // Whether the icon derived from the current value failed to load (not a
  // real item name, or no icon on the wiki). Reset whenever value changes
  // so switching to a different, valid name gets a fresh attempt.
  const [iconFailed, setIconFailed] = useState(false);
  useEffect(() => setIconFailed(false), [value]);
  // Shown only while the field is closed (not actively being typed into) —
  // while open, the dropdown's own per-result icons already show what's
  // relevant, and re-deriving this on every keystroke would fire a failed
  // image request for nearly every partial string typed.
  const closedIconUrl = !open && value.trim() && !iconFailed ? iconUrlFor(value) : null;
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = value.trim();

  // Debounced search — fires on every value change while the field is
  // focused, not just on an explicit "search" action, so results feel live.
  useEffect(() => {
    if (!open || query.length < 2) {
      setItemResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchOsrsItems(query)
        .then((res) => {
          if (!cancelled) setItemResults(res.items);
        })
        .catch(() => {
          if (!cancelled) setItemResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  // Group matches are a pure in-memory name filter — no debounce needed.
  const matchedGroups = useMemo(() => {
    if (!open || query.length < 2 || !itemGroups?.length) return [];
    const q = query.toLowerCase();
    return itemGroups.filter((g) => g.name.toLowerCase().includes(q));
  }, [itemGroups, query, open]);

  const suggestions: Suggestion[] = useMemo(
    () => [...matchedGroups.map((group) => ({ kind: "group" as const, group })), ...itemResults.map((item) => ({ kind: "item" as const, item }))],
    [matchedGroups, itemResults],
  );

  useEffect(() => {
    if (open && containerRef.current) setDropdownRect(containerRef.current.getBoundingClientRect());
  }, [open, suggestions.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useEffect(() => {
    setHighlighted(0);
  }, [suggestions.length]);

  const pick = (s: Suggestion) => {
    // Clear rather than fill the field: a pick is final, so leaving the name
    // in place would only make the blur re-commit it.
    onChange("");
    if (s.kind === "item") onPickItem?.(s.item.name);
    else onPickGroup?.(s.group);
    // Not setOpen(false) here: picking via onMouseDown keeps focus on the
    // input (see its preventDefault below), so onFocus — the only thing
    // that flips `open` back to true — never re-fires afterward. Clearing
    // the value/results is enough to hide the dropdown (empty suggestions);
    // staying "open" lets the very next keystroke search again instead of
    // silently doing nothing until the input is blurred and refocused.
    setItemResults([]);
  };

  const showDropdown = open && (loading || suggestions.length > 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (suggestions[highlighted]) {
        e.preventDefault();
        pick(suggestions[highlighted]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${containerClassName ?? ""}`}>
      {closedIconUrl && (
        <img
          src={closedIconUrl}
          alt=""
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 object-contain"
          onError={() => setIconFailed(true)}
        />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => onCommit?.(value)}
        onKeyDown={handleKeyDown}
        className={`${className ?? controlClass()} ${closedIconUrl ? "pl-8" : ""}`}
      />

      {showDropdown && dropdownRect && (
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownRect.bottom + 4, left: dropdownRect.left, width: Math.max(dropdownRect.width, 220), zIndex: 9999 }}
          className="max-h-64 overflow-y-auto rounded-md border border-line bg-surface-raised p-1 shadow-pop"
        >
          {loading && suggestions.length === 0 ? (
            <div className="px-2.5 py-1.5 text-sm text-fg-subtle">Searching…</div>
          ) : (
            suggestions.map((s, i) => (
              <button
                key={s.kind === "item" ? `item:${s.item.name}` : `group:${s.group.id}`}
                type="button"
                // preventDefault stops the browser's default mousedown-blur
                // behavior — without it, clicking a suggestion blurs the
                // input (firing onCommit with the stale, still-being-typed
                // text) a tick before pick()'s own commit fires, racing two
                // commits for one click. The actual pick happens on click
                // (after mouseup), not here: picking clears the results and
                // unmounts this button, and doing that mid-mousedown (before
                // mouseup fires) makes the browser re-target mouseup against
                // whatever is now under the cursor instead — which can steal
                // focus from the input despite this preventDefault, since
                // that's a different default action on a different element.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm ${
                  i === highlighted ? "bg-accent text-accent-fg" : "text-fg hover:bg-surface-hover"
                }`}
              >
                {s.kind === "item" ? (
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
                    <span className={`num ml-auto shrink-0 text-xs ${i === highlighted ? "text-accent-fg/70" : "text-fg-subtle"}`}>group · {s.group.itemNames.length}</span>
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

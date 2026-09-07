import { useEffect, useRef, useState } from "react";
import type { OsrsItemSearchResult } from "@bingo/shared";
import { searchOsrsItems } from "../../api/osrsItemsApi";

// A plain controlled text input augmented with OSRS Wiki item suggestions
// (name + icon) as the admin types — a drop-in for any "item name" text
// field. Freeform text always stays valid and is never overwritten except
// by an explicit suggestion pick: plenty of item names in this app (e.g.
// "Any Cerberus drop", "Waves 1-3 proof") are bingo-specific labels, not
// real OSRS items, and won't have wiki matches at all.
export function ItemSearchInput({
  value,
  onChange,
  placeholder,
  className,
  containerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Applied to the wrapping (relative-positioned) div — set this, not `className`, to control layout/sizing (e.g. "flex-1") in a flex row. */
  containerClassName?: string;
}) {
  const [results, setResults] = useState<OsrsItemSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search — fires on every value change while the field is
  // focused, not just on an explicit "search" action, so results feel live.
  useEffect(() => {
    const query = value.trim();
    if (!open || query.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchOsrsItems(query)
        .then((res) => {
          if (!cancelled) setResults(res.items);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, open]);

  useEffect(() => {
    if (open && containerRef.current) setDropdownRect(containerRef.current.getBoundingClientRect());
  }, [open, results.length]);

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
  }, [results]);

  const pick = (item: OsrsItemSearchResult) => {
    onChange(item.name);
    setResults([]);
    setOpen(false);
  };

  const showDropdown = open && (loading || results.length > 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (results[highlighted]) {
        e.preventDefault();
        pick(results[highlighted]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${containerClassName ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={className ?? "w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"}
      />

      {showDropdown && dropdownRect && (
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownRect.bottom + 4, left: dropdownRect.left, width: Math.max(dropdownRect.width, 220), zIndex: 9999 }}
          className="bg-slate-900 border border-slate-700 rounded-md shadow-xl max-h-64 overflow-y-auto"
        >
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>
          ) : (
            results.map((item, i) => (
              <button
                key={item.name}
                type="button"
                onMouseDown={() => pick(item)}
                className={`w-full flex items-center gap-2 text-left px-2 py-1.5 text-xs transition-colors ${
                  i === highlighted ? "bg-indigo-600 text-white" : "text-slate-200 hover:bg-slate-700"
                }`}
              >
                <img
                  src={item.iconUrl}
                  alt=""
                  className="w-5 h-5 object-contain shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
                <span className="truncate">{item.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

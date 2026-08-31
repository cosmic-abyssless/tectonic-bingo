import { useState, useEffect, useRef } from "react";

export function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
  readOnly,
}: {
  value: string;
  options: { id: string; label: string; group?: string }[];
  placeholder: string;
  onChange: (id: string) => void;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.id === value)?.label ?? "";

  // Measure input position whenever the dropdown opens
  useEffect(() => {
    if (open && containerRef.current) {
      setDropdownRect(containerRef.current.getBoundingClientRect());
    }
  }, [open]);

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  // Reset query when value is cleared externally
  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  const q = query.toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  // Build groups for display
  const groups = new Map<string, { id: string; label: string }[]>();
  const ungrouped: { id: string; label: string }[] = [];
  for (const opt of filtered) {
    if (opt.group) {
      const list = groups.get(opt.group) ?? [];
      list.push(opt);
      groups.set(opt.group, list);
    } else {
      ungrouped.push(opt);
    }
  }
  const hasGroups = groups.size > 0;
  // Map opt.id → flat index for keyboard highlight
  const flatIndexMap = new Map(filtered.map((opt, i) => [opt.id, i]));

  const select = (id: string) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={(e) => {
            if (readOnly) return;
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!readOnly) setOpen(true);
          }}
          onClick={() => {
            if (!readOnly) setOpen(true);
          }}
          onKeyDown={readOnly ? undefined : handleKeyDown}
          className={`w-full border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none placeholder:text-slate-500 ${readOnly ? "cursor-default select-none text-slate-400 pr-3 bg-slate-800" : "bg-slate-900 pr-8 focus:border-indigo-500"}`}
        />
        {!readOnly && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        )}
      </div>

      {open && dropdownRect && (
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropdownRect.bottom + 4,
            left: dropdownRect.left,
            width: dropdownRect.width,
            zIndex: 9999,
          }}
          className="bg-slate-900 border border-slate-700 rounded-md shadow-xl max-h-60 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">No matches</div>
          ) : hasGroups ? (
            <>
              {ungrouped.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onMouseDown={() => select(opt.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    flatIndexMap.get(opt.id) === highlighted
                      ? "bg-indigo-600 text-white"
                      : "text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {[...groups.entries()].map(([group, opts]) => (
                <div key={group}>
                  <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-700 sticky top-0">
                    {group}
                  </div>
                  {opts.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onMouseDown={() => select(opt.id)}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                        flatIndexMap.get(opt.id) === highlighted
                          ? "bg-indigo-600 text-white"
                          : "text-slate-200 hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ))}
            </>
          ) : (
            filtered.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                onMouseDown={() => select(opt.id)}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  i === highlighted
                    ? "bg-indigo-600 text-white"
                    : "text-slate-200 hover:bg-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

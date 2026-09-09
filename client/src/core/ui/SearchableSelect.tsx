import { useState, useEffect, useRef } from "react";
import { ChevronDownIcon } from "./icons";
import { inputClass } from "./Field";

interface Option {
  id: string;
  label: string;
  group?: string;
}

export function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
  readOnly,
}: {
  value: string;
  options: Option[];
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
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  // Build groups for display
  const groups = new Map<string, Option[]>();
  const ungrouped: Option[] = [];
  for (const opt of filtered) {
    if (opt.group) {
      const list = groups.get(opt.group) ?? [];
      list.push(opt);
      groups.set(opt.group, list);
    } else {
      ungrouped.push(opt);
    }
  }
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

  const renderOption = (opt: Option) => (
    <button
      key={opt.id}
      type="button"
      onMouseDown={() => select(opt.id)}
      className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
        flatIndexMap.get(opt.id) === highlighted ? "bg-accent text-accent-fg" : "text-fg hover:bg-surface-hover"
      }`}
    >
      {opt.label}
    </button>
  );

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
          className={`${inputClass} h-10 ${readOnly ? "cursor-default select-none text-fg-muted" : "pr-9"}`}
        />
        {!readOnly && <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />}
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
          className="max-h-60 overflow-y-auto rounded-md border border-line bg-surface-raised shadow-pop"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-fg-subtle">No matches</div>
          ) : (
            <>
              {ungrouped.map(renderOption)}
              {[...groups.entries()].map(([group, opts]) => (
                <div key={group}>
                  <div className="sticky top-0 border-b border-line bg-surface-raised px-3 py-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                    {group}
                  </div>
                  {opts.map(renderOption)}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { ChevronDownIcon } from "./icons";
import { controlClass } from "./Field";

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
  // Until when a stray focus/click on the input mustn't reopen the list (see select()).
  const noReopenUntil = useRef(0);

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

  // Put the input away: focus goes to the enclosing dialog (or, with none, nowhere),
  // so a phone's keyboard closes. Not to <body>: a modal's focus trap would just hand
  // focus back to the first field.
  const dismissInput = () => {
    const host = containerRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (host) host.focus({ preventScroll: true });
    else inputRef.current?.blur();
  };

  // `pointer`: picked by tap/click rather than the keyboard. That closes the input
  // for good and, since touch browsers can send a follow-up click/focus to the
  // input once the option under the finger has gone, ignores anything that would
  // reopen the list for a moment.
  const select = (id: string, pointer = false) => {
    onChange(id);
    setQuery("");
    setOpen(false);
    if (pointer) {
      noReopenUntil.current = Date.now() + 500;
      dismissInput();
    }
  };
  const openList = () => {
    if (readOnly) return;
    if (Date.now() <= noReopenUntil.current) {
      dismissInput();
      return;
    }
    setOpen(true);
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
      // Selecting on mousedown unmounts the dropdown before mouseup, which then
      // lands on the input and refocuses it — reopening what we just closed.
      // preventDefault keeps focus put; the pick itself happens on click.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => select(opt.id, true)}
      className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
        flatIndexMap.get(opt.id) === highlighted ? "bg-accent text-on-accent" : "text-on-surface hover:bg-surface-hover"
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
          onFocus={openList}
          onClick={openList}
          onKeyDown={readOnly ? undefined : handleKeyDown}
          className={`${controlClass()} ${readOnly ? "cursor-default select-none text-on-surface-muted" : "pr-9"}`}
        />
        {!readOnly && <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-subtle" />}
      </div>

      {open && dropdownRect && (
        <div
          ref={dropdownRef}
          // A hook for a theme's CSS to dress the list (the comic signup stage gives it an ink border).
          data-select-list=""
          style={{
            position: "fixed",
            // max-h-60 below is 240px — if that much (or the space actually available) doesn't fit under the
            // input but there's more room above it, anchor from the bottom edge instead: it grows upward from a
            // fixed point regardless of how tall the (variable, filtered-result-dependent) list ends up, so
            // there's no need to know its height up front the way flipping a `top` position would.
            ...(window.innerHeight - dropdownRect.bottom < 240 && dropdownRect.top > window.innerHeight - dropdownRect.bottom
              ? { bottom: window.innerHeight - dropdownRect.top + 4 }
              : { top: dropdownRect.bottom + 4 }),
            left: dropdownRect.left,
            width: dropdownRect.width,
            zIndex: 9999,
          }}
          className="max-h-60 overflow-y-auto rounded-md border border-outline bg-surface-raised shadow-pop"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-on-surface-subtle">No matches</div>
          ) : (
            <>
              {ungrouped.map(renderOption)}
              {[...groups.entries()].map(([group, opts]) => (
                <div key={group}>
                  <div className="sticky top-0 border-b border-outline bg-surface-raised px-3 py-1 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">
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

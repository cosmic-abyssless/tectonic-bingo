import { useState, useEffect, useRef } from "react";
import type {
  BoardResponse,
  BoardTile,
  ScreenshotAnalysis,
  SubmissionSummary,
  TileProgress,
} from "../types";

const ROW_ORDER = [
  "demonic",
  "draconic",
  "spectral",
  "animalistic",
  "god_wars",
  "vampyric",
  "desert",
] as const;

const BADGE_LABEL: Record<string, string> = {
  demonic: "Demonic",
  draconic: "Draconic",
  spectral: "Spectral",
  animalistic: "Animalistic",
  god_wars: "God Wars",
  vampyric: "Vampyric",
  desert: "Desert",
};

// ---------------------------------------------------------------------------
// SearchableSelect — a text-input combobox with optional grouped options
// ---------------------------------------------------------------------------
function SearchableSelect({
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

  // Close on outside click or scroll (scroll shifts the anchor but we can't easily follow it)
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

  // Reset query when value is cleared externally (e.g. tile change resets item)
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

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  initialTileId?: string;
  progressMap?: Map<string, TileProgress>;
  submissions?: SubmissionSummary[];
}

export function SubmissionModal({
  onClose,
  onSuccess,
  initialTileId,
  progressMap,
  submissions,
}: Props) {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [selectedTileId, setSelectedTileId] = useState(initialTileId ?? "");
  const [partBSelected, setPartBSelected] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionQty, setSubmissionQty] = useState(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysis | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/board")
      .then((r) => r.json())
      .then(setBoard)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const selectedTile: BoardTile | undefined = board?.tiles.find(
    (t) => t.id === selectedTileId,
  );

  const tileProgress = progressMap?.get(selectedTileId);
  const isPartAComplete = tileProgress?.sideAStatus === "completed";
  const partBLockedOut =
    !isPartAComplete && !!selectedTile?.sides.B?.requiresPartA;

  // If Part A is complete, always submit Part B. If locked out, force Part A.
  const selectedPart: "A" | "B" = isPartAComplete
    ? "B"
    : partBSelected && !partBLockedOut
      ? "B"
      : "A";
  const currentSideData = selectedTile?.sides[selectedPart];
  const selectedItem = currentSideData?.items.find(
    (i) => i.id === selectedItemId,
  );

  // Items already submitted (non-rejected) for this tile — used to filter
  // out options when requiresNoDuplicates is true.
  const excludedItemNames = (() => {
    const excluded = new Set<string>();
    if (!currentSideData?.requiresNoDuplicates) return excluded;
    const tileSubmissions = (submissions ?? []).filter(
      (s) => s.tileId === selectedTileId && s.status !== "rejected",
    );
    for (const sub of tileSubmissions) {
      // Always exclude items already submitted for the current side
      if (sub.side === selectedPart) {
        for (const item of sub.items) excluded.add(item.itemName);
      }
      // For Part B: also exclude Part A submissions if Part A also requires no duplicates
      if (
        selectedPart === "B" &&
        sub.side === "A" &&
        selectedTile?.sides.A?.requiresNoDuplicates
      ) {
        for (const item of sub.items) excluded.add(item.itemName);
      }
    }
    return excluded;
  })();

  // Auto-prefill tile + part + item from AI match — only if the user hasn't already chosen
  useEffect(() => {
    const match = analysis?.detectedMatch;
    if (!match) return;

    if (!selectedTileId) {
      // Nothing chosen yet — set tile, part, and item
      setSelectedTileId(match.tileId);
      if (!isPartAComplete) setPartBSelected(match.side === "B");
      if (!isPartAComplete || match.side === "B")
        setSelectedItemId(match.tileSideItemId);
    } else if (selectedTileId === match.tileId && !selectedItemId) {
      // Correct tile already selected, fill part + item
      if (!isPartAComplete) setPartBSelected(match.side === "B");
      if (!isPartAComplete || match.side === "B")
        setSelectedItemId(match.tileSideItemId);
    }
    // Only re-run when a new analysis result arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  // Auto-select the item when there is only one available option
  useEffect(() => {
    if (!currentSideData) return;
    const available = currentSideData.items.filter(
      (i) => !excludedItemNames.has(i.itemName),
    );
    if (available.length === 1) {
      setSelectedItemId(available[0].id);
      setSubmissionQty(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTileId, selectedPart]);

  const analyzeScreenshot = async (file: File) => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const fd = new FormData();
      fd.append("screenshot", file);
      const r = await fetch("/api/submissions/analyze", {
        method: "POST",
        body: fd,
      });
      if (r.ok) setAnalysis(await r.json());
      // silently ignore errors — analysis is best-effort
    } catch {
      // ignore
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, WebP, etc.)");
      return;
    }
    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    analyzeScreenshot(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const isValid = imageFile && selectedTileId && selectedItemId;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("screenshot", imageFile);
    formData.append("tileId", selectedTileId);
    formData.append("side", selectedPart);
    formData.append("itemId", selectedItemId);
    formData.append("quantity", String(submissionQty));
    if (analysis !== null) {
      formData.append("codewordFound", String(analysis.codewordFound));
    }

    try {
      const r = await fetch("/api/submissions", {
        method: "POST",
        body: formData,
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error ?? "Submission failed");
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Group tiles by badge category, sorted by column within each category
  const tilesByCategory = new Map<string, BoardTile[]>();
  for (const cat of ROW_ORDER) tilesByCategory.set(cat, []);
  for (const tile of board?.tiles ?? []) {
    tilesByCategory.get(tile.badgeCategory)?.push(tile);
  }
  for (const list of tilesByCategory.values()) {
    list.sort((a, b) => a.boardCol - b.boardCol);
  }

  // Build flat option arrays for SearchableSelect
  const tileOptions = ROW_ORDER.flatMap((cat) =>
    (tilesByCategory.get(cat) ?? []).map((t) => ({
      id: t.id,
      label: t.name,
      group: BADGE_LABEL[cat],
    })),
  );

  const itemOptions = currentSideData
    ? currentSideData.items
        .filter((item) => !excludedItemNames.has(item.itemName))
        .map((item) => ({
          id: item.id,
          label: item.itemName,
        }))
    : [];

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-white font-bold text-lg">Submit Completion</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg leading-none p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Image drop zone */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Screenshot
            </label>
            <div
              className={`relative border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                dragOver
                  ? "border-indigo-400 bg-indigo-500/10"
                  : "border-slate-600 hover:border-slate-500"
              } ${imagePreview ? "h-52" : "h-40"}`}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="absolute inset-0 w-full h-full object-contain p-2 rounded-lg"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
                  <svg
                    className="w-10 h-10"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm">
                    Drag & drop or click to upload
                  </span>
                  <span className="text-xs">PNG, JPG, WebP — max 10 MB</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />

            {/* Analysis result */}
            {(analyzing || analysis) && (
              <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2.5 space-y-1.5 text-sm">
                {analyzing && (
                  <p className="flex items-center gap-2 text-slate-400">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    Analyzing screenshot…
                  </p>
                )}
                {analysis && (
                  <>
                    {/* Codeword check */}
                    <p
                      className={`flex items-center gap-1.5 font-medium ${analysis.codewordFound ? "text-green-400" : "text-yellow-400"}`}
                    >
                      <span>{analysis.codewordFound ? "✓" : "⚠"}</span>
                      {analysis.codewordFound
                        ? `Codeword '${analysis.codeword}' found`
                        : `Codeword '${analysis.codeword}' not visible`}
                    </p>

                    {/* Warnings */}
                    {analysis.warnings.map((w, i) => (
                      <p
                        key={i}
                        className="text-yellow-300/80 text-xs leading-snug"
                      >
                        {w}
                      </p>
                    ))}

                    {/* Detected item */}
                    {analysis.detectedMatch ? (
                      <p className="text-slate-400 text-xs">
                        Detected:{" "}
                        <span className="text-slate-300 font-medium">
                          {analysis.detectedMatch.itemName}
                        </span>
                        <span className="text-slate-500">
                          {" "}
                          — {analysis.detectedMatch.tileName} Part{" "}
                          {analysis.detectedMatch.side}
                        </span>
                      </p>
                    ) : (
                      <p className="text-slate-500 text-xs">
                        No matching bingo item detected
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Tile searchable select */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Tile
            </label>
            <SearchableSelect
              value={selectedTileId}
              options={tileOptions}
              placeholder="Search tiles…"
              onChange={(id) => {
                setSelectedTileId(id);
                setPartBSelected(false);
                setSelectedItemId("");
                setSubmissionQty(1);
              }}
            />
          </div>

          {/* Part selector */}
          {selectedTile &&
            (isPartAComplete ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <svg
                  className="w-3.5 h-3.5 text-green-400 shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
                Part A complete — submitting Part B
              </div>
            ) : partBLockedOut ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                Submitting for Part A — Part B is available once Part A is
                complete
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Part
                </label>
                <div className="flex rounded-md overflow-hidden border border-slate-600">
                  <button
                    type="button"
                    onClick={() => {
                      setPartBSelected(false);
                      setSelectedItemId("");
                      setSubmissionQty(1);
                    }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      !partBSelected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Part A
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPartBSelected(true);
                      setSelectedItemId("");
                      setSubmissionQty(1);
                    }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors border-l border-slate-600 cursor-pointer ${
                      partBSelected
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Part B
                  </button>
                </div>
              </div>
            ))}

          {/* Item searchable select */}
          {selectedTile && currentSideData && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                What are you submitting?
              </label>
              <SearchableSelect
                key={selectedTileId + "-" + selectedPart}
                value={selectedItemId}
                options={itemOptions}
                placeholder="Search items…"
                readOnly={itemOptions.length === 1}
                onChange={(id) => {
                  setSelectedItemId(id);
                  setSubmissionQty(1);
                }}
              />
            </div>
          )}

          {/* Quantity input — only for items requiring more than 1 */}
          {selectedItem && selectedItem.quantity > 1 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                How many are you submitting?
                <span className="ml-2 text-slate-500 font-normal">
                  ({selectedItem.quantity} needed in total)
                </span>
              </label>
              <input
                type="number"
                min={1}
                max={selectedItem.quantity}
                value={submissionQty}
                onChange={(e) =>
                  setSubmissionQty(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        </div>
      </div>
    </div>
  );
}

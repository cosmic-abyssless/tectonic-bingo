import { useState, useEffect, useRef } from "react";
import type { BoardResponse, BoardTile, ScreenshotAnalysis } from "../types";

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

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  initialTileId?: string;
}

export function SubmissionModal({ onClose, onSuccess, initialTileId }: Props) {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [selectedTileId, setSelectedTileId] = useState(initialTileId ?? "");
  const [selectedSideItem, setSelectedSideItem] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    (t) => t.id === selectedTileId
  );

  // Auto-prefill tile + item from AI match — only if the user hasn't already chosen
  useEffect(() => {
    const match = analysis?.detectedMatch;
    if (!match) return;
    if (!selectedTileId) {
      // Nothing chosen yet — set both
      setSelectedTileId(match.tileId);
      setSelectedSideItem(`${match.side}:${match.tileSideItemId}`);
    } else if (selectedTileId === match.tileId && !selectedSideItem) {
      // Correct tile already selected, just fill the item
      setSelectedSideItem(`${match.side}:${match.tileSideItemId}`);
    }
  // Only re-run when a new analysis result arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  const analyzeScreenshot = async (file: File) => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const fd = new FormData();
      fd.append("screenshot", file);
      const r = await fetch("/api/submissions/analyze", { method: "POST", body: fd });
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

  const isValid = imageFile && selectedTileId && selectedSideItem;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);

    const [side, itemId] = selectedSideItem.split(":") as ["A" | "B", string];

    const formData = new FormData();
    formData.append("screenshot", imageFile);
    formData.append("tileId", selectedTileId);
    formData.append("side", side);
    formData.append("itemId", itemId);
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
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm">Drag & drop or click to upload</span>
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
                    <p className={`flex items-center gap-1.5 font-medium ${analysis.codewordFound ? "text-green-400" : "text-yellow-400"}`}>
                      <span>{analysis.codewordFound ? "✓" : "⚠"}</span>
                      {analysis.codewordFound
                        ? `Codeword '${analysis.codeword}' found`
                        : `Codeword '${analysis.codeword}' not visible`}
                    </p>

                    {/* Warnings */}
                    {analysis.warnings.map((w, i) => (
                      <p key={i} className="text-yellow-300/80 text-xs leading-snug">{w}</p>
                    ))}

                    {/* Detected item */}
                    {analysis.detectedMatch ? (
                      <p className="text-slate-400 text-xs">
                        Detected:{" "}
                        <span className="text-slate-300 font-medium">{analysis.detectedMatch.itemName}</span>
                        <span className="text-slate-500"> — {analysis.detectedMatch.tileName} Part {analysis.detectedMatch.side}</span>
                      </p>
                    ) : (
                      <p className="text-slate-500 text-xs">No matching bingo item detected</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Tile dropdown */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Tile
            </label>
            <select
              value={selectedTileId}
              onChange={(e) => { setSelectedTileId(e.target.value); setSelectedSideItem(""); }}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select a tile…</option>
              {ROW_ORDER.map((cat) => {
                const catTiles = tilesByCategory.get(cat) ?? [];
                if (!catTiles.length) return null;
                return (
                  <optgroup key={cat} label={BADGE_LABEL[cat]}>
                    {catTiles.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Combined part + item dropdown */}
          {selectedTile && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                What are you submitting?
              </label>
              <select
                value={selectedSideItem}
                onChange={(e) => setSelectedSideItem(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select part & item…</option>
                {(["A", "B"] as const).map((side) => {
                  const sideData = selectedTile.sides[side];
                  if (!sideData) return null;
                  return (
                    <optgroup key={side} label={`Part ${side} — ${sideData.points} pts`}>
                      {sideData.items.map((item) => (
                        <option key={item.id} value={`${side}:${item.id}`}>
                          {item.quantity > 1 ? `${item.quantity}× ` : ""}
                          {item.itemName}
                          {item.optionsGroup ? " (choose one)" : ""}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
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

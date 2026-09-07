import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Bingo, ClaimInput, RequirementNode, ScreenshotAnalysis, SubmissionDetails, TeamTaskProgress, Tile, TileCategory, TileTask, TileWildcard } from "@bingo/shared";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Modal, ModalHeader } from "../ui/Modal";
import { useAnalyzeScreenshot, useCreateSubmission } from "../../api/queries";
import { buildLeafClaimMaps, leafProgress } from "../board/taskClaims";
import { collectLeaves } from "../board/requirementTree";
import { leafLabel } from "../board/TaskPanel";
import { getFreezeUnlockAt } from "../board/tileProgress";

function getAvailableTasks(tile: Tile, statusByTaskId: Map<string, string>): TileTask[] {
  return tile.tasks.filter((task, i) => {
    const status = statusByTaskId.get(task.id) ?? "not_started";
    if (status === "completed") return false;
    if (task.submitRequiresPrevious) {
      const prev = i > 0 ? tile.tasks[i - 1] : null;
      if (prev && statusByTaskId.get(prev.id) !== "completed") return false;
    }
    return true;
  });
}

interface Props {
  slug: string;
  bingo: Bingo;
  tiles: Tile[];
  categories: TileCategory[];
  progress: TeamTaskProgress[];
  teamSubmissions: SubmissionDetails[];
  initialTileId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

// A claim the player has finished picking but not yet submitted; several can go in one screenshot.
interface StagedClaim {
  claim: ClaimInput;
  label: string;
}

export function SubmissionModal({ slug, bingo, tiles, categories, progress, teamSubmissions, initialTileId, onClose, onSuccess }: Props) {
  const [selectedTileId, setSelectedTileId] = useState(initialTileId ?? "");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedItemName, setSelectedItemName] = useState("");
  const [stagedClaims, setStagedClaims] = useState<StagedClaim[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWildcardMode, setIsWildcardMode] = useState(false);
  const [selectedWildcardId, setSelectedWildcardId] = useState("");
  const [submissionQty, setSubmissionQty] = useState(1);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysis | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const createSubmission = useCreateSubmission(slug);
  const analyzeScreenshot = useAnalyzeScreenshot(slug);

  const statusByTaskId = useMemo(() => new Map(progress.map((p) => [p.taskId, p.status])), [progress]);
  const selectedTile = tiles.find((t) => t.id === selectedTileId);
  const availableTasks = selectedTile ? getAvailableTasks(selectedTile, statusByTaskId) : [];
  const currentTask = selectedTile?.tasks.find((t) => t.id === selectedTaskId);

  const claimMaps = useMemo(() => buildLeafClaimMaps(teamSubmissions), [teamSubmissions]);
  const isManualTask = currentTask?.scoringMode === "manual";

  // Leaves of the current task that still need items (counting claims staged in this modal),
  // narrowed to the selected wildcard's scope.
  const taskLeaves: RequirementNode[] = currentTask ? collectLeaves(currentTask.requirement) : [];
  const stagedQtyByNode = new Map<string, number>();
  for (const { claim } of stagedClaims) stagedQtyByNode.set(claim.nodeId, (stagedQtyByNode.get(claim.nodeId) ?? 0) + (claim.quantity ?? 1));
  const openLeaves = taskLeaves.filter(
    (leaf) => leaf.kind === "ITEM" && leafProgress(leaf.id, leaf.distinctItems, claimMaps) + (stagedQtyByNode.get(leaf.id) ?? 0) < (leaf.quantity ?? 1),
  );
  const availableWildcards: TileWildcard[] = (selectedTile?.wildcards ?? []).filter(
    (wc) => wc.applicableNodeId === null || openLeaves.some((leaf) => leaf.id === wc.applicableNodeId),
  );
  const selectedWildcard = availableWildcards.find((wc) => wc.id === selectedWildcardId);
  const leafOptions = isWildcardMode && selectedWildcard?.applicableNodeId
    ? openLeaves.filter((leaf) => leaf.id === selectedWildcard.applicableNodeId)
    : openLeaves;
  const selectedLeaf = leafOptions.find((leaf) => leaf.id === selectedNodeId);
  const itemOptions = selectedLeaf && !isWildcardMode ? selectedLeaf.acceptedItemNames.map((name) => ({ id: name, label: name })) : [];

  // Auto-select the task when there's exactly one available.
  useEffect(() => {
    if (availableTasks.length === 1) setSelectedTaskId(availableTasks[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTileId, availableTasks.map((t) => t.id).join(",")]);

  // Auto-select the leaf when there's exactly one option. Re-runs when the
  // wildcard mode/selection changes because those narrow the leaf options and
  // their onChange handlers clear selectedNodeId. Skipped once claims are staged
  // so a submit never silently includes a claim the player didn't pick.
  useEffect(() => {
    if (!currentTask || isManualTask || stagedClaims.length > 0) return;
    if (leafOptions.length === 1) {
      setSelectedNodeId(leafOptions[0].id);
      setSubmissionQty(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId, currentTask, isWildcardMode, selectedWildcardId]);

  // Auto-select the item name when the leaf accepts exactly one.
  useEffect(() => {
    if (itemOptions.length === 1) setSelectedItemName(itemOptions[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, isWildcardMode]);

  // Auto-select the wildcard when there's exactly one available option.
  useEffect(() => {
    if (!isWildcardMode || availableWildcards.length !== 1) return;
    setSelectedWildcardId(availableWildcards[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWildcardMode, selectedTileId, selectedTaskId]);

  // Auto-fill from AI detection — only if the user hasn't already chosen.
  useEffect(() => {
    const match = analysis?.detectedMatch;
    if (!match) return;
    const matchedTile = tiles.find((t) => t.id === match.tileId);
    if (!matchedTile) return;
    const freezeUnlocksAt = getFreezeUnlockAt(bingo.startsAt, matchedTile);
    if (freezeUnlocksAt && Date.now() < freezeUnlocksAt) return;
    const matchedTask = matchedTile.tasks.find((t) => t.id === match.taskId);
    if (!matchedTask) return;
    const available = getAvailableTasks(matchedTile, statusByTaskId);
    if (!available.some((t) => t.id === match.taskId)) return;

    if (!selectedTileId) {
      setSelectedTileId(match.tileId);
      setSelectedTaskId(match.taskId);
      setSelectedNodeId(match.nodeId);
      setSelectedItemName(match.itemName);
    } else if (selectedTileId === match.tileId && !selectedNodeId) {
      setSelectedTaskId(match.taskId);
      setSelectedNodeId(match.nodeId);
      setSelectedItemName(match.itemName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  // Auto-fill wildcard from AI detection (only when no regular item was matched).
  useEffect(() => {
    const wc = analysis?.detectedWildcard;
    if (!wc || analysis?.detectedMatch) return;
    const matchedTile = tiles.find((t) => t.id === wc.tileId);
    if (!matchedTile) return;
    const freezeUnlocksAt = getFreezeUnlockAt(bingo.startsAt, matchedTile);
    if (freezeUnlocksAt && Date.now() < freezeUnlocksAt) return;

    if (!selectedTileId) {
      setSelectedTileId(wc.tileId);
      setIsWildcardMode(true);
      setSelectedWildcardId(wc.wildcardId);
    } else if (selectedTileId === wc.tileId && !selectedWildcardId) {
      setIsWildcardMode(true);
      setSelectedWildcardId(wc.wildcardId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  const runAnalysis = async (file: File) => {
    setAnalysis(null);
    setAnalysisFailed(false);
    try {
      const fd = new FormData();
      fd.append("screenshot", file);
      const result = await analyzeScreenshot.mutateAsync(fd);
      setAnalysis(result);
    } catch {
      setAnalysisFailed(true);
    }
  };

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, WebP, etc.)");
      return;
    }
    setError(null);
    setAnalysisFailed(false);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    runAnalysis(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (dragCounter.current === 0) setDragOver(true);
      dragCounter.current++;
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDragLeave = () => {
      dragCounter.current--;
      if (dragCounter.current === 0) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragOver(false);
      const file = e.dataTransfer?.files[0];
      if (file) handleFile(file);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFile]);

  const manualLeaf = isManualTask ? taskLeaves.find((leaf) => leaf.kind === "MANUAL") : undefined;

  // The claim described by the current picker state, or null while it's incomplete.
  const currentClaim: StagedClaim | null = (() => {
    if (!currentTask) return null;
    if (manualLeaf) return { claim: { nodeId: manualLeaf.id }, label: `${currentTask.label}: manual review` };
    if (!selectedLeaf) return null;
    const qtyPrefix = submissionQty > 1 ? `${submissionQty}× ` : "";
    if (isWildcardMode) {
      if (!selectedWildcard) return null;
      return {
        claim: { nodeId: selectedLeaf.id, itemName: selectedWildcard.itemName, quantity: submissionQty, wildcardId: selectedWildcard.id },
        label: `${currentTask.label}: ${qtyPrefix}${selectedWildcard.itemName} (wildcard)`,
      };
    }
    if (!selectedItemName) return null;
    return { claim: { nodeId: selectedLeaf.id, itemName: selectedItemName, quantity: submissionQty }, label: `${currentTask.label}: ${qtyPrefix}${selectedItemName}` };
  })();
  const pickerEmpty = !selectedNodeId && !selectedWildcardId && !isManualTask;
  const isValid = !!imageFile && !!selectedTileId && (currentClaim !== null || (stagedClaims.length > 0 && pickerEmpty));

  const resetPicker = () => {
    setSelectedNodeId("");
    setSelectedItemName("");
    setSelectedWildcardId("");
    setIsWildcardMode(false);
    setSubmissionQty(1);
  };

  const stageCurrentClaim = () => {
    if (!currentClaim) return;
    setStagedClaims((prev) => [...prev, currentClaim]);
    resetPicker();
  };

  const handleSubmit = async () => {
    if (!isValid || !imageFile) return;
    setError(null);

    const formData = new FormData();
    formData.append("screenshot", imageFile);
    const claims = [...stagedClaims, ...(currentClaim ? [currentClaim] : [])].map((s) => s.claim);
    formData.append("claims", JSON.stringify(claims));

    try {
      await createSubmission.mutateAsync(formData);
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
    }
  };

  // Group tiles by category, sorted by sortOrder, filtered to available (not fully complete, not frozen).
  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const tileOptions = [...sortedCategories, null].flatMap((cat) => {
    const catTiles = tiles
      .filter((t) => t.categoryId === (cat?.id ?? null))
      .sort((a, b) => a.boardRow - b.boardRow || a.boardCol - b.boardCol);
    return catTiles.flatMap((t) => {
      const available = getAvailableTasks(t, statusByTaskId);
      const freezeUnlocksAt = getFreezeUnlockAt(bingo.startsAt, t);
      const frozen = !!(freezeUnlocksAt && Date.now() < freezeUnlocksAt);
      if (available.length === 0 || frozen) return [];
      return [{ id: t.id, label: t.name, group: cat?.label }];
    });
  });

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Submit Completion" onClose={onClose} />

      <div className="p-5 space-y-5">
        {/* Image drop zone */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Screenshot</label>
          <div
            className={`relative border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              dragOver ? "border-indigo-400 bg-indigo-500/10" : "border-slate-600 hover:border-slate-500"
            } ${imagePreview ? "h-52" : "h-40"}`}
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-contain p-2 rounded-lg" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
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

          {(analyzeScreenshot.isPending || analysis || analysisFailed) && (
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2.5 space-y-1.5 text-sm">
              {analysisFailed && <p className="text-slate-500 text-xs">Screenshot analysis unavailable — select your tile and item manually.</p>}
              {analyzeScreenshot.isPending && (
                <p className="flex items-center gap-2 text-slate-400">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  Analyzing screenshot…
                </p>
              )}
              {analysis && (
                <>
                  <p className={`flex items-center gap-1.5 font-medium ${analysis.codewordFound ? "text-green-400" : "text-yellow-400"}`}>
                    <span>{analysis.codewordFound ? "✓" : "⚠"}</span>
                    {analysis.codewordFound ? `Codeword '${analysis.codeword}' found` : `Codeword '${analysis.codeword}' not visible`}
                  </p>
                  {analysis.warnings.map((w, i) => (
                    <p key={i} className="text-yellow-300/80 text-xs leading-snug">
                      {w}
                    </p>
                  ))}
                  {analysis.detectedMatch ? (
                    <p className="text-slate-400 text-xs">
                      Detected: <span className="text-slate-300 font-medium">{analysis.detectedMatch.itemName}</span>
                      <span className="text-slate-500"> — {analysis.detectedMatch.tileName}</span>
                    </p>
                  ) : analysis.detectedWildcard ? (
                    <p className="text-slate-400 text-xs">
                      Detected wildcard: <span className="text-amber-300 font-medium">{analysis.detectedWildcard.itemName}</span>
                      <span className="text-slate-500"> — {analysis.detectedWildcard.tileName}</span>
                    </p>
                  ) : (
                    <p className="text-slate-500 text-xs">No matching bingo item detected</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Tile select */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Tile</label>
          <SearchableSelect
            value={selectedTileId}
            options={tileOptions}
            placeholder="Search tiles…"
            onChange={(id) => {
              setSelectedTileId(id);
              setSelectedTaskId("");
              setStagedClaims([]);
              resetPicker();
            }}
          />
        </div>

        {/* Task selector — shown only when more than one task is available to pick from */}
        {selectedTile && availableTasks.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Task</label>
            <div className="flex rounded-md overflow-hidden border border-slate-600">
              {availableTasks.map((task, i) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => {
                    setSelectedTaskId(task.id);
                    resetPicker();
                  }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${i > 0 ? "border-l border-slate-600" : ""} ${
                    selectedTaskId === task.id ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {task.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedTile && availableTasks.length === 1 && currentTask && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <svg className="w-3.5 h-3.5 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                clipRule="evenodd"
              />
            </svg>
            Submitting for {currentTask.label}
          </div>
        )}

        {isManualTask && (
          <p className="text-sm text-slate-400 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5">
            This task is judged manually by a mod — just submit your screenshot as proof.
          </p>
        )}

        {/* Wildcard toggle */}
        {selectedTile && currentTask && !isManualTask && availableWildcards.length > 0 && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isWildcardMode}
              onChange={(e) => {
                setIsWildcardMode(e.target.checked);
                setSelectedNodeId("");
                setSelectedItemName("");
                setSelectedWildcardId("");
              }}
              className="w-4 h-4 accent-indigo-500 cursor-pointer"
            />
            <span className="text-sm text-slate-300">Submit with a wildcard</span>
          </label>
        )}

        {selectedTile && isWildcardMode && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Wildcard drop</label>
            <SearchableSelect
              key={selectedTileId + "-" + selectedTaskId + "-wc"}
              value={selectedWildcardId}
              options={availableWildcards.map((wc) => ({ id: wc.id, label: wc.itemName }))}
              placeholder="Select wildcard…"
              readOnly={availableWildcards.length === 1}
              onChange={(id) => {
                setSelectedWildcardId(id);
                setSelectedNodeId("");
              }}
            />
            {selectedWildcard?.description && <p className="mt-1.5 text-xs text-slate-500 leading-snug">{selectedWildcard.description}</p>}
          </div>
        )}

        {/* Leaf select */}
        {selectedTile && currentTask && !isManualTask && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {isWildcardMode ? "Which requirement does the wildcard count towards?" : "Which requirement are you submitting for?"}
            </label>
            <SearchableSelect
              key={selectedTileId + "-" + selectedTaskId + "-" + selectedWildcardId + (isWildcardMode ? "-wc" : "")}
              value={selectedNodeId}
              options={leafOptions.map((leaf) => ({ id: leaf.id, label: leafLabel(leaf) }))}
              placeholder="Search requirements…"
              readOnly={leafOptions.length === 1}
              onChange={(id) => {
                setSelectedNodeId(id);
                setSelectedItemName("");
                setSubmissionQty(1);
              }}
            />
          </div>
        )}

        {/* Item select — only when the leaf accepts more than one item */}
        {selectedLeaf && itemOptions.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">What are you submitting?</label>
            <SearchableSelect
              key={selectedNodeId + "-item"}
              value={selectedItemName}
              options={itemOptions}
              placeholder="Search items…"
              onChange={setSelectedItemName}
            />
          </div>
        )}

        {/* Quantity */}
        {selectedLeaf && (selectedLeaf.quantity ?? 1) > 1 && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              How many are you submitting?
              <span className="ml-2 text-slate-500 font-normal">({selectedLeaf.quantity} needed in total)</span>
            </label>
            <input
              type="number"
              min={1}
              max={selectedLeaf.quantity ?? 1}
              value={submissionQty}
              onChange={(e) => setSubmissionQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        {/* Claims already staged for this screenshot */}
        {stagedClaims.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Also in this screenshot</label>
            <ul className="space-y-1">
              {stagedClaims.map((staged, i) => (
                <li key={i} className="flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-300">
                  <span>{staged.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${staged.label}`}
                    onClick={() => setStagedClaims((prev) => prev.filter((_, j) => j !== i))}
                    className="text-slate-500 hover:text-red-400 cursor-pointer"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {currentClaim && !manualLeaf && (
          <button type="button" onClick={stageCurrentClaim} className="text-sm text-indigo-400 hover:text-indigo-300 cursor-pointer">
            + Add another item from this screenshot
          </button>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!isValid || createSubmission.isPending || analyzeScreenshot.isPending}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {createSubmission.isPending ? "Submitting…" : analyzeScreenshot.isPending ? "Analyzing…" : "Submit for Review"}
        </button>
      </div>
    </Modal>
  );
}

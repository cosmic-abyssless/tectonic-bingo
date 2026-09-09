import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Bingo, ClaimInput, GraphNode, ScreenshotAnalysis, SubmissionDetails, TeamNodeState, Tile, TileCategory } from "@bingo/shared";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Button, IconButton } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field, Input } from "../ui/Field";
import { AlertIcon, CheckIcon, ImageIcon, PlusIcon, SpinnerIcon, XIcon } from "../ui/icons";
import { useAnalyzeScreenshot, useCreateSubmission } from "../../api/queries";
import { buildLeafClaimMaps, itemLeafValue, leafComplete } from "../board/taskClaims";
import { collectLeaves, collectLeavesWithAncestors } from "../board/requirementTree";
import { leafLabel } from "../board/labels";
import { deriveBoardNodeStatuses, getFreezeUnlockAt } from "../board/tileProgress";
import { getAvailableTasks } from "../../headless/submissionFlowLogic";

interface Props {
  slug: string;
  bingo: Bingo;
  tiles: Tile[];
  categories: TileCategory[];
  nodeStates: TeamNodeState[];
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

export function SubmissionModal({ slug, bingo, tiles, categories, nodeStates, teamSubmissions, initialTileId, onClose, onSuccess }: Props) {
  const [selectedTileId, setSelectedTileId] = useState(initialTileId ?? "");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [stagedClaims, setStagedClaims] = useState<StagedClaim[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionQty, setSubmissionQty] = useState(1);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysis | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const createSubmission = useCreateSubmission(slug);
  const analyzeScreenshot = useAnalyzeScreenshot(slug);

  const statusByNodeId = useMemo(() => deriveBoardNodeStatuses(tiles, nodeStates, teamSubmissions), [tiles, nodeStates, teamSubmissions]);
  const selectedTile = tiles.find((t) => t.id === selectedTileId);
  const availableTasks = selectedTile ? getAvailableTasks(selectedTile, statusByNodeId) : [];
  const currentTask = selectedTile?.node.children.find((t) => t.id === selectedTaskId);

  const claimMaps = useMemo(() => buildLeafClaimMaps(teamSubmissions), [teamSubmissions]);
  const isManualTask = currentTask?.kind === "MANUAL";

  // Leaves of the current task, paired with every enclosing composite so a
  // SUM's child (duplicates still wanted until the SUM's own total is met)
  // can be told apart from an ordinary leaf (open until it individually
  // completes) — see docs/item-quantity-model.md §8 — and so a leaf whose
  // ANY/COUNT is already satisfied by a sibling can be dropped entirely: it
  // no longer progresses the tile, however many are submitted.
  const taskLeaves = currentTask ? collectLeavesWithAncestors(currentTask) : [];
  const stagedNodeIds = new Set(stagedClaims.map((s) => s.claim.nodeId));
  // Approved + already-staged-this-screenshot quantity for one leaf.
  const leafPendingValue = (nodeId: string) =>
    itemLeafValue(nodeId, claimMaps) + stagedClaims.filter((s) => s.claim.nodeId === nodeId).reduce((sum, s) => sum + (s.claim.quantity ?? 1), 0);
  const sumProgress = (sum: GraphNode) => sum.children.reduce((total, child) => total + leafPendingValue(child.id), 0);
  const sumStillOpen = (sum: GraphNode) => sumProgress(sum) < (sum.quantity ?? 1);
  // "Completed" here means server-confirmed (an approved claim already
  // satisfied it, and rescoring landed a teamNodeState row) — a still-pending
  // sibling claim doesn't hide the rest, since a mod could yet reject it.
  const ancestorAlreadySatisfied = (ancestors: GraphNode[]) => ancestors.some((a) => statusByNodeId.get(a.id) === "completed");

  const openLeaves: GraphNode[] = taskLeaves
    .filter(({ leaf }) => leaf.kind === "ITEM")
    .filter(({ leaf, ancestors }) => {
      // A submission may not claim the same node twice — a leaf already
      // staged in this screenshot can't be offered again (adjust its
      // quantity instead of staging a second claim on it).
      if (stagedNodeIds.has(leaf.id)) return false;
      if (ancestorAlreadySatisfied(ancestors)) return false;
      const parent = ancestors[ancestors.length - 1];
      if (parent?.kind === "SUM") return sumStillOpen(parent);
      return !leafComplete(leaf.id, claimMaps);
    })
    .map(({ leaf }) => leaf);
  const selectedLeaf = openLeaves.find((leaf) => leaf.id === selectedNodeId);
  const selectedLeafAncestors = selectedLeaf ? taskLeaves.find((tl) => tl.leaf.id === selectedLeaf.id)?.ancestors : undefined;
  const selectedLeafParent = selectedLeafAncestors?.[selectedLeafAncestors.length - 1];
  const enclosingSum = selectedLeafParent?.kind === "SUM" ? selectedLeafParent : undefined;

  // Auto-select the task when there's exactly one available.
  useEffect(() => {
    if (availableTasks.length === 1) setSelectedTaskId(availableTasks[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTileId, availableTasks.map((t) => t.id).join(",")]);

  // Auto-select the leaf when there's exactly one option. Skipped once
  // claims are staged so a submit never silently includes a claim the
  // player didn't pick.
  useEffect(() => {
    if (!currentTask || isManualTask || stagedClaims.length > 0) return;
    if (openLeaves.length === 1) {
      setSelectedNodeId(openLeaves[0]!.id);
      setSubmissionQty(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId, currentTask]);

  // Auto-fill from AI detection — only if the user hasn't already chosen.
  useEffect(() => {
    const match = analysis?.detectedMatch;
    if (!match) return;
    const matchedTile = tiles.find((t) => t.id === match.tileId);
    if (!matchedTile) return;
    const freezeUnlocksAt = getFreezeUnlockAt(bingo.startsAt, matchedTile);
    if (freezeUnlocksAt && Date.now() < freezeUnlocksAt) return;
    // The matched leaf may be nested under a task's ALL/ANY/COUNT/SUM wrapper
    // — find the task (direct tile child) that owns it.
    const matchedTask = matchedTile.node.children.find((t) => collectLeaves(t).some((l) => l.id === match.nodeId));
    if (!matchedTask) return;
    const available = getAvailableTasks(matchedTile, statusByNodeId);
    if (!available.some((t) => t.id === matchedTask.id)) return;

    if (!selectedTileId) {
      setSelectedTileId(match.tileId);
      setSelectedTaskId(matchedTask.id);
      setSelectedNodeId(match.nodeId);
    } else if (selectedTileId === match.tileId && !selectedNodeId) {
      setSelectedTaskId(matchedTask.id);
      setSelectedNodeId(match.nodeId);
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

  const manualLeaf = isManualTask ? taskLeaves.find(({ leaf }) => leaf.kind === "MANUAL")?.leaf : undefined;

  // The claim described by the current picker state, or null while it's incomplete.
  const currentClaim: StagedClaim | null = (() => {
    if (!currentTask) return null;
    if (manualLeaf) return { claim: { nodeId: manualLeaf.id }, label: `${currentTask.label}: manual review` };
    if (!selectedLeaf || !selectedLeaf.itemName) return null;
    const qtyPrefix = submissionQty > 1 ? `${submissionQty}× ` : "";
    return {
      claim: { nodeId: selectedLeaf.id, itemName: selectedLeaf.itemName, quantity: submissionQty },
      label: `${currentTask.label}: ${qtyPrefix}${selectedLeaf.itemName}`,
    };
  })();
  const pickerEmpty = !selectedNodeId && !isManualTask;
  const isValid = !!imageFile && !!selectedTileId && (currentClaim !== null || (stagedClaims.length > 0 && pickerEmpty));

  const resetPicker = () => {
    setSelectedNodeId("");
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
      const available = getAvailableTasks(t, statusByNodeId);
      const freezeUnlocksAt = getFreezeUnlockAt(bingo.startsAt, t);
      const frozen = !!(freezeUnlocksAt && Date.now() < freezeUnlocksAt);
      if (available.length === 0 || frozen) return [];
      return [{ id: t.id, label: t.name, group: cat?.label }];
    });
  });


  return (
    <Dialog isOpen onClose={onClose}>
      <DialogHeader title="Submit completion" onClose={onClose} />

      <div className="space-y-5 p-5">
        {/* Image drop zone */}
        <Field label="Screenshot" as="div">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`relative block w-full rounded-md border border-dashed transition-colors ${
              dragOver ? "border-fg bg-surface-raised" : "border-line-strong hover:border-fg/60"
            } ${imagePreview ? "h-52" : "h-40"}`}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="absolute inset-0 h-full w-full rounded-md object-contain p-2" />
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fg-subtle">
                <ImageIcon size={28} />
                <span className="text-sm text-fg-muted">Drag & drop or click to upload</span>
                <span className="text-xs">PNG, JPG, WebP — max 10 MB</span>
              </span>
            )}
          </button>
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

          {analysisFailed && <p className="mt-2 text-xs text-fg-subtle">Screenshot analysis unavailable — select your tile and item manually.</p>}
          {analyzeScreenshot.isPending && (
            <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
              <SpinnerIcon className="animate-spin" />
              Analyzing screenshot…
            </p>
          )}
          {analysis && (
            <Notice tone={analysis.codewordFound ? "ok" : "warn"} icon={analysis.codewordFound ? <CheckIcon /> : <AlertIcon />} className="mt-2">
              <p className="font-medium">{analysis.codewordFound ? `Codeword '${analysis.codeword}' found` : `Codeword '${analysis.codeword}' not visible`}</p>
              {analysis.warnings.map((w, i) => (
                <p key={i} className="text-xs leading-snug text-fg-muted">
                  {w}
                </p>
              ))}
              <p className="text-xs text-fg-muted">
                {analysis.detectedMatch ? (
                  <>
                    Detected: <span className="font-medium text-fg">{analysis.detectedMatch.itemName}</span>
                    <span className="text-fg-subtle"> — {analysis.detectedMatch.tileName}</span>
                  </>
                ) : (
                  "No matching bingo item detected"
                )}
              </p>
            </Notice>
          )}
        </Field>

        <Field label="Tile">
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
        </Field>

        {/* Task selector — shown only when more than one task is available to pick from */}
        {selectedTile && availableTasks.length > 1 && (
          <Field label="Task" as="div">
            <div className="flex overflow-hidden rounded-md border border-line-strong">
              {availableTasks.map((task, i) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => {
                    setSelectedTaskId(task.id);
                    resetPicker();
                  }}
                  className={`h-10 flex-1 text-sm font-medium transition-colors ${i > 0 ? "border-l border-line-strong" : ""} ${
                    selectedTaskId === task.id ? "bg-accent text-accent-fg" : "bg-bg text-fg-muted hover:text-fg"
                  }`}
                >
                  {task.label}
                </button>
              ))}
            </div>
          </Field>
        )}
        {selectedTile && availableTasks.length === 1 && currentTask && (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <CheckIcon className="text-ok" />
            Submitting for {currentTask.label}
          </p>
        )}

        {isManualTask && <Notice tone="info">This task is judged manually by a mod — just submit your screenshot as proof.</Notice>}

        {/* Leaf select — the leaf IS the item now, one name each */}
        {selectedTile && currentTask && !isManualTask && (
          <Field label="Which requirement are you submitting for?">
            <SearchableSelect
              key={selectedTileId + "-" + selectedTaskId}
              value={selectedNodeId}
              options={openLeaves.map((leaf) => ({ id: leaf.id, label: leafLabel(leaf) }))}
              placeholder="Search requirements…"
              readOnly={openLeaves.length === 1}
              onChange={(id) => {
                setSelectedNodeId(id);
                setSubmissionQty(1);
              }}
            />
          </Field>
        )}

        {/* Quantity — only when the selected leaf sits under a SUM (duplicates count toward its total) */}
        {selectedLeaf && enclosingSum && (
          <Field label="How many are you submitting?" hint={`${enclosingSum.quantity ?? 1} needed in total`}>
            <Input
              type="number"
              min={1}
              max={enclosingSum.quantity ?? 1}
              value={submissionQty}
              onChange={(e) => setSubmissionQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="num"
            />
          </Field>
        )}

        {/* Claims already staged for this screenshot */}
        {stagedClaims.length > 0 && (
          <Field label="Also in this screenshot" as="div">
            <ul className="divide-y divide-line rounded-md border border-line">
              {stagedClaims.map((staged, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-fg">
                  <span>{staged.label}</span>
                  <IconButton label={`Remove ${staged.label}`} size="sm" onPress={() => setStagedClaims((prev) => prev.filter((_, j) => j !== i))}>
                    <XIcon />
                  </IconButton>
                </li>
              ))}
            </ul>
          </Field>
        )}

        {currentClaim && !manualLeaf && (
          <Button variant="ghost" size="sm" onPress={stageCurrentClaim}>
            <PlusIcon />
            Add another item from this screenshot
          </Button>
        )}

        {error && <Notice tone="danger">{error}</Notice>}

        <Button variant="primary" className="w-full" onPress={handleSubmit} isDisabled={!isValid || createSubmission.isPending || analyzeScreenshot.isPending}>
          {createSubmission.isPending ? "Submitting…" : analyzeScreenshot.isPending ? "Analyzing…" : "Submit for review"}
        </Button>
      </div>
    </Dialog>
  );
}

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, type ClaimInput, type GraphNode, type ScreenshotAnalysis } from "@bingo/shared";
import { useAnalyzeScreenshot, useCreateSubmission } from "../api/queries";
import { buildLeafClaimMaps, itemLeafValue, leafComplete } from "../core/board/taskClaims";
import { collectLeaves, collectLeavesWithAncestors } from "../core/board/requirementTree";
import { leafLabel } from "../core/board/labels";
import { deriveBoardNodeStatuses, getFreezeUnlockAt } from "../core/board/tileProgress";
import { getAvailableTasks } from "./submissionFlowLogic";
import { useBingoPageRaw } from "./BingoPageProvider";
import type { SubmissionFlowModel } from "./types";

// A claim the player has finished picking but not yet submitted; several can go in one screenshot.
interface StagedClaim {
  claim: ClaimInput;
  label: string;
}

export function useSubmissionFlow({
  initialTileId,
  initialTaskId,
  initialFile,
  onClose,
  onSuccess,
}: {
  initialTileId?: string;
  /** Pre-picks a part of `initialTileId`; ignored without a tile. */
  initialTaskId?: string;
  initialFile?: File;
  onClose: () => void;
  onSuccess: () => void;
}): SubmissionFlowModel {
  const { slug, bingo, tiles, categories, nodeStates, teamSubmissions } = useBingoPageRaw();

  const [selectedTileId, setSelectedTileId] = useState(initialTileId ?? "");
  const [selectedTaskId, setSelectedTaskId] = useState(initialTileId ? (initialTaskId ?? "") : "");
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
  // What's left to reach the SUM's target, given what's already
  // approved/staged — the ceiling for a new claim's quantity. Not the raw
  // target: entering up to the full target regardless of existing progress
  // lets a submission overshoot it (the picker then hides the item for
  // good, having "used up" more than was actually left).
  const sumRemaining = (sum: GraphNode) => Math.max(1, (sum.quantity ?? 1) - sumProgress(sum));
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
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_MB} MB`);
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

  // Seeds the screenshot from outside (global drag-drop/paste-to-submit —
  // see useScreenshotCapture): fires on mount if a file was already handed
  // in, and again any time the caller passes a *new* File while this flow
  // stays mounted (e.g. pasting a second screenshot without closing).
  useEffect(() => {
    if (initialFile) handleFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

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
    const catTiles = tiles.filter((t) => t.categoryId === (cat?.id ?? null)).sort((a, b) => a.boardRow - b.boardRow || a.boardCol - b.boardCol);
    return catTiles.flatMap((t) => {
      const available = getAvailableTasks(t, statusByNodeId);
      const freezeUnlocksAt = getFreezeUnlockAt(bingo.startsAt, t);
      const frozen = !!(freezeUnlocksAt && Date.now() < freezeUnlocksAt);
      if (available.length === 0 || frozen) return [];
      return [{ id: t.id, label: t.name, group: cat?.label }];
    });
  });

  const analysisStatus: SubmissionFlowModel["analysis"]["status"] = analyzeScreenshot.isPending ? "analyzing" : analysisFailed ? "failed" : analysis ? "done" : "idle";

  return {
    screenshot: {
      file: imageFile,
      previewUrl: imagePreview,
      dragOver,
      error,
      pick: handleFile,
      openFilePicker: () => fileInputRef.current?.click(),
      inputProps: {
        ref: fileInputRef,
        type: "file",
        accept: "image/*",
        onChange: (e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        },
      },
    },
    analysis: {
      status: analysisStatus,
      result: analysis
        ? {
            codewordFound: analysis.codewordFound,
            codeword: analysis.codeword,
            warnings: analysis.warnings,
            detected: analysis.detectedMatch ? { itemName: analysis.detectedMatch.itemName, tileName: analysis.detectedMatch.tileName } : null,
          }
        : null,
    },
    tile: {
      selectedId: selectedTileId,
      options: tileOptions,
      select: (id) => {
        setSelectedTileId(id);
        setSelectedTaskId("");
        setStagedClaims([]);
        resetPicker();
      },
    },
    task: {
      selectedId: selectedTaskId,
      options: availableTasks.map((t) => ({ id: t.id, label: t.label ?? "" })),
      select: (id) => {
        setSelectedTaskId(id);
        resetPicker();
      },
      current: currentTask ? { id: currentTask.id, label: currentTask.label ?? "", isManual: isManualTask ?? false } : null,
      autoSelected: availableTasks.length === 1,
    },
    requirement: {
      visible: !!selectedTile && !!currentTask && !isManualTask,
      selectedId: selectedNodeId,
      options: openLeaves.map((leaf) => ({ id: leaf.id, label: leafLabel(leaf) })),
      readOnly: openLeaves.length === 1,
      select: (id) => {
        setSelectedNodeId(id);
        setSubmissionQty(1);
      },
      pickerKey: `${selectedTileId}-${selectedTaskId}`,
    },
    quantity: {
      visible: !!selectedLeaf && !!enclosingSum,
      value: submissionQty,
      max: enclosingSum ? sumRemaining(enclosingSum) : 1,
      needed: enclosingSum?.quantity ?? 1,
      set: (n) => setSubmissionQty(Math.max(1, enclosingSum ? Math.min(n, sumRemaining(enclosingSum)) : n)),
    },
    staged: {
      items: stagedClaims.map((s) => ({ label: s.label })),
      remove: (index) => setStagedClaims((prev) => prev.filter((_, j) => j !== index)),
      canStageCurrent: !!currentClaim && !manualLeaf,
      stageCurrent: stageCurrentClaim,
    },
    submit: {
      isValid,
      isSubmitting: createSubmission.isPending,
      isAnalyzing: analyzeScreenshot.isPending,
      error,
      run: handleSubmit,
    },
    close: onClose,
  };
}

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, proofRequirementFor, proofStatus, type ClaimInput, type GraphNode, type ScreenshotAnalysis, type SubmissionKind } from "@bingo/shared";
import { useAnalyzeScreenshot, useCreateSubmission } from "../api/queries";
import { buildLeafClaimMaps, itemLeafValue, leafComplete, sumTotal } from "../core/board/taskClaims";
import { collectLeaves, collectLeavesWithAncestors } from "../core/board/requirementTree";
import { leafLabel } from "../core/board/labels";
import { lockReason } from "../core/board/exclusivity";
import { deriveBoardNodeStatuses, getFreezeUnlockAt } from "../core/board/tileProgress";
import { getAvailableTasks } from "./submissionFlowLogic";
import { useBingoPageRaw } from "./BingoPageProvider";
import type { SubmissionFlowModel } from "./types";

// How long a screenshot's analysis may hold up submitting. Past this the
// submit button is freed and the analysis carries on in the background (its
// result still fills in whatever the player hasn't picked yet).
const ANALYSIS_MAX_WAIT_MS = 2000;

// A claim the player has finished picking but not yet submitted; several can go in one screenshot.
interface StagedClaim {
  claim: ClaimInput;
  label: string;
}

export function useSubmissionFlow({
  initialTileId,
  initialTaskId,
  initialFile,
  initialKind,
  onClose,
  onSuccess,
}: {
  initialTileId?: string;
  /** Pre-picks a part of `initialTileId`; ignored without a tile. */
  initialTaskId?: string;
  initialFile?: File;
  /** "proof": start on posting a Proof screenshot (CONTEXT.md) for `initialTileId` (and `initialTaskId`). */
  initialKind?: SubmissionKind;
  onClose: () => void;
  onSuccess: () => void;
}): SubmissionFlowModel {
  const { slug, bingo, tiles, categories, nodeStates, teamSubmissions, locks, viewingTeam, viewerId } = useBingoPageRaw();

  // Who the drop is for. On your own team you default to yourself and may pick a teammate; a mod on another team has to pick.
  const onViewingTeam = !!viewingTeam?.members.some((m) => m.id === viewerId);
  const submitterOptions = (viewingTeam?.members ?? [])
    .map((m) => ({ id: m.id, label: m.id === viewerId ? `${m.displayName} (me)` : m.displayName, isMe: m.id === viewerId }))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.label.localeCompare(b.label));
  const [submitterId, setSubmitterId] = useState(() => (onViewingTeam ? viewerId : submitterOptions.length === 1 ? submitterOptions[0]!.id : ""));
  // Only ever sent to name another team (mods) or another player.
  const targetTeamId = viewingTeam && !viewingTeam.isMine ? viewingTeam.id : undefined;
  const forUserId = submitterId && submitterId !== viewerId ? submitterId : undefined;

  const [selectedTileId, setSelectedTileId] = useState(initialTileId ?? "");
  const [selectedTaskId, setSelectedTaskId] = useState(initialTileId ? (initialTaskId ?? "") : "");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [stagedClaims, setStagedClaims] = useState<StagedClaim[]>([]);
  const [chosenKind, setChosenKind] = useState<SubmissionKind>(initialKind ?? "drop");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionQty, setSubmissionQty] = useState(1);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysis | null>(null);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [analysisOverdue, setAnalysisOverdue] = useState(false);
  const analysisRun = useRef(0);
  const overdueTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const createSubmission = useCreateSubmission(slug);
  const analyzeScreenshot = useAnalyzeScreenshot(slug);

  const statusByNodeId = useMemo(() => deriveBoardNodeStatuses(tiles, nodeStates, teamSubmissions), [tiles, nodeStates, teamSubmissions]);
  const selectedTile = tiles.find((t) => t.id === selectedTileId);
  const availableTasks = selectedTile ? getAvailableTasks(selectedTile, statusByNodeId) : [];
  const currentTask = selectedTile?.node.children.find((t) => t.id === selectedTaskId);

  const claimMaps = useMemo(() => buildLeafClaimMaps(teamSubmissions), [teamSubmissions]);

  // Proof screenshots (CONTEXT.md): the requirement the picked Tile (or Task, when per-Task) falls under. "Proof
  // screenshot" is only on offer where there is one; a Tile-wide one needs no Task picked.
  const proofRequirement = selectedTile ? proofRequirementFor(selectedTile, selectedTaskId || null) : null;
  const kind: SubmissionKind = proofRequirement ? chosenKind : "drop";
  const isProof = kind === "proof";
  const proofTileWide = isProof && proofRequirement?.taskId === null;

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
  // Each item times what it counts as (CONTEXT.md "Counts as"), as the server totals it.
  const sumStillOpen = (sum: GraphNode) => sumTotal(sum, leafPendingValue) < (sum.quantity ?? 1);
  // "Completed" here means server-confirmed (an approved claim already
  // satisfied it, and rescoring landed a teamNodeState row) — a still-pending
  // sibling claim doesn't hide the rest, since a mod could yet reject it.
  const ancestorAlreadySatisfied = (ancestors: GraphNode[]) => ancestors.some((a) => statusByNodeId.get(a.id) === "completed");

  // Items the team already used somewhere else (exclusive items) can't be claimed here: they are left out of the
  // options and listed under the picker with why.
  const openLeaves: GraphNode[] = taskLeaves
    .filter(({ leaf }) => leaf.kind === "ITEM")
    .filter(({ leaf }) => !locks.has(leaf.id))
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
  const lockedLeaves: { label: string; reason: string }[] = taskLeaves
    .filter(({ leaf }) => leaf.kind === "ITEM" && locks.has(leaf.id))
    .map(({ leaf }) => ({ label: leafLabel(leaf), reason: lockReason(locks.get(leaf.id)!) }));
  const selectedLeaf = openLeaves.find((leaf) => leaf.id === selectedNodeId);
  const selectedLeafAncestors = selectedLeaf ? taskLeaves.find((tl) => tl.leaf.id === selectedLeaf.id)?.ancestors : undefined;
  const selectedLeafParent = selectedLeafAncestors?.[selectedLeafAncestors.length - 1];
  const enclosingSum = selectedLeafParent?.kind === "SUM" ? selectedLeafParent : undefined;
  const selectedCountsAs = enclosingSum ? (selectedLeaf?.countsAs ?? 1) : 1;

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

  // Auto-fill from AI detection — only if the user hasn't already chosen. Not for a Proof screenshot: it shows no drop.
  useEffect(() => {
    const match = analysis?.detectedMatch;
    if (!match || isProof) return;
    const matchedTile = tiles.find((t) => t.id === match.tileId);
    if (!matchedTile) return;
    const freezeUnlocksAt = getFreezeUnlockAt(bingo.effectiveStartsAt, matchedTile);
    if (freezeUnlocksAt && Date.now() < freezeUnlocksAt) return;
    // The matched leaf may be nested under a task's ALL/ANY/COUNT/SUM wrapper
    // — find the task (direct tile child) that owns it.
    const matchedTask = matchedTile.node.children.find((t) => collectLeaves(t).some((l) => l.id === match.nodeId));
    if (!matchedTask) return;
    if (locks.has(match.nodeId)) return; // already used elsewhere: don't preselect something the server would refuse
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
    // Only the latest screenshot's analysis counts: an older one finishing late
    // must not overwrite it (or free/hold the submit button for the wrong file).
    const run = ++analysisRun.current;
    clearTimeout(overdueTimer.current);
    setAnalysis(null);
    setAnalysisFailed(false);
    setAnalysisOverdue(false);
    overdueTimer.current = setTimeout(() => {
      if (analysisRun.current === run) setAnalysisOverdue(true);
    }, ANALYSIS_MAX_WAIT_MS);
    try {
      const fd = new FormData();
      fd.append("screenshot", file);
      if (targetTeamId) fd.append("teamId", targetTeamId); // the codeword to look for is that team's
      const result = await analyzeScreenshot.mutateAsync(fd);
      if (analysisRun.current === run) setAnalysis(result);
    } catch {
      if (analysisRun.current === run) setAnalysisFailed(true);
    } finally {
      if (analysisRun.current === run) clearTimeout(overdueTimer.current);
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
  const isValid =
    !!imageFile && !!selectedTileId && !!submitterId && (isProof ? !!proofRequirement : currentClaim !== null || (stagedClaims.length > 0 && pickerEmpty));

  // A drop where its Player has no Proof screenshot for the requirement yet (none, or only rejected ones): warn, but
  // still let it through. It's flagged in review.
  const submitterStatus = proofRequirement && submitterId ? proofStatus(teamSubmissions.map((d) => d.submission), submitterId, proofRequirement) : null;
  const submitterName = submitterOptions.find((o) => o.id === submitterId)?.label.replace(/ \(me\)$/, "") ?? "They";
  const proofWarning =
    !isProof && proofRequirement && (submitterStatus === "none" || submitterStatus === "rejected")
      ? {
          message: `${submitterId === viewerId ? "You haven't" : `${submitterName} hasn't`} posted a Proof screenshot for this ${proofRequirement.taskId ? "task" : "tile"} yet`,
          post: () => setChosenKind("proof"),
        }
      : null;

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
    if (isProof && proofRequirement) {
      formData.append("kind", "proof");
      formData.append("tileId", proofRequirement.tileId);
      if (proofRequirement.taskId) formData.append("taskId", proofRequirement.taskId);
    } else {
      const claims = [...stagedClaims, ...(currentClaim ? [currentClaim] : [])].map((s) => s.claim);
      formData.append("claims", JSON.stringify(claims));
    }
    if (targetTeamId) formData.append("teamId", targetTeamId);
    if (forUserId) formData.append("forUserId", forUserId);

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
      const freezeUnlocksAt = getFreezeUnlockAt(bingo.effectiveStartsAt, t);
      const frozen = !!(freezeUnlocksAt && Date.now() < freezeUnlocksAt);
      if (available.length === 0 || frozen) return [];
      return [{ id: t.id, label: t.name, group: cat?.label }];
    });
  });

  useEffect(() => () => clearTimeout(overdueTimer.current), []);

  const analysisStatus: SubmissionFlowModel["analysis"]["status"] = analyzeScreenshot.isPending ? "analyzing" : analysisFailed ? "failed" : analysis ? "done" : "idle";

  return {
    codeword: viewingTeam?.codeword ?? null,
    submitter: {
      visible: !onViewingTeam || submitterOptions.length > 1,
      required: !onViewingTeam,
      teamName: viewingTeam?.name ?? "",
      selectedId: submitterId,
      options: submitterOptions,
      select: setSubmitterId,
    },
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
      // A Tile-wide Proof screenshot is for the whole Tile: no Task to pick.
      options: proofTileWide ? [] : availableTasks.map((t) => ({ id: t.id, label: t.label ?? "" })),
      select: (id) => {
        setSelectedTaskId(id);
        resetPicker();
      },
      current: currentTask && !proofTileWide ? { id: currentTask.id, label: currentTask.label ?? "", isManual: (isManualTask && !isProof) ?? false } : null,
      autoSelected: availableTasks.length === 1 && !proofTileWide,
    },
    requirement: {
      visible: !!selectedTile && !!currentTask && !isManualTask && !isProof,
      selectedId: selectedNodeId,
      options: openLeaves.map((leaf) => ({ id: leaf.id, label: leafLabel(leaf) })),
      locked: lockedLeaves,
      readOnly: openLeaves.length === 1,
      select: (id) => {
        setSelectedNodeId(id);
        setSubmissionQty(1);
      },
      pickerKey: `${selectedTileId}-${selectedTaskId}`,
    },
    quantity: {
      visible: !!selectedLeaf && !!enclosingSum && !isProof,
      value: submissionQty,
      max: Math.max(1, Math.ceil((enclosingSum?.quantity ?? 1) / selectedCountsAs)),
      needed: enclosingSum?.quantity ?? 1,
      countsAs: selectedCountsAs,
      set: (n) => setSubmissionQty(Math.max(1, n)),
    },
    kind: {
      value: kind,
      available: !!proofRequirement,
      select: setChosenKind,
      label: proofRequirement?.label ?? null,
      note: proofRequirement?.note ?? null,
    },
    proofWarning,
    staged: {
      items: isProof ? [] : stagedClaims.map((s) => ({ label: s.label })),
      remove: (index) => setStagedClaims((prev) => prev.filter((_, j) => j !== index)),
      canStageCurrent: !!currentClaim && !manualLeaf && !isProof,
      stageCurrent: stageCurrentClaim,
    },
    submit: {
      isValid,
      isSubmitting: createSubmission.isPending,
      // Still analysing, but only counts as holding up the submit for so long.
      isAnalyzing: analyzeScreenshot.isPending && !analysisOverdue,
      error,
      run: handleSubmit,
    },
    close: onClose,
  };
}

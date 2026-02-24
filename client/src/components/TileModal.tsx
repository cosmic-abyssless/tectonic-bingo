import { useEffect, useState } from "react";
import type {
  BoardTile,
  TileProgress,
  SubmissionSummary,
} from "../types";
import { TILE_IMAGES } from "../tileImages";
import { SidePanel } from "./SidePanel";
import { SubmissionRow } from "./SubmissionRow";

const BADGE_COLORS: Record<string, string> = {
  demonic: "text-red-400 border-red-500 bg-red-500/10",
  draconic: "text-emerald-400 border-emerald-500 bg-emerald-500/10",
  spectral: "text-purple-400 border-purple-500 bg-purple-500/10",
  animalistic: "text-orange-400 border-orange-500 bg-orange-500/10",
  god_wars: "text-yellow-400 border-yellow-500 bg-yellow-500/10",
  vampyric: "text-rose-400 border-rose-500 bg-rose-500/10",
  desert: "text-amber-400 border-amber-500 bg-amber-500/10",
};

const BADGE_BORDER: Record<string, string> = {
  demonic: "border-red-500",
  draconic: "border-emerald-500",
  spectral: "border-purple-500",
  animalistic: "border-orange-500",
  god_wars: "border-yellow-500",
  vampyric: "border-rose-500",
  desert: "border-amber-500",
};

interface Props {
  tile: BoardTile;
  onClose: () => void;
  onSubmit?: () => void;
  progress?: TileProgress;
  submissions?: SubmissionSummary[];
  isFrozen?: boolean;
}

export function TileModal({
  tile,
  onClose,
  onSubmit,
  progress,
  submissions,
  isFrozen,
}: Props) {
  const badgeColor =
    BADGE_COLORS[tile.badgeCategory] ??
    "text-slate-400 border-slate-500 bg-slate-500/10";
  const borderColor = BADGE_BORDER[tile.badgeCategory] ?? "border-slate-500";
  const imgSrc = TILE_IMAGES[tile.name];
  const [imgFailed, setImgFailed] = useState(false);

  const claimedPts =
    (progress?.sideAPointsAwarded ?? 0) + (progress?.sideBPointsAwarded ?? 0);

  const bothComplete =
    progress?.sideAStatus === "completed" &&
    progress?.sideBStatus === "completed";
  const submitDisabled = bothComplete || isFrozen;

  // Approved quantity per side+itemName, used by SidePanel for item progress
  const approvedQtyBySideAndItem = new Map<string, Map<string, number>>();
  // Submitted item names (non-rejected) per side, used for strikethrough
  const submittedNamesBySide = new Map<string, Set<string>>();
  // Approved submission count per side, used for minSubmissions progress
  const approvedSubCountBySide = new Map<string, number>();
  for (const sub of submissions ?? []) {
    if (sub.status === "rejected") continue;
    const submitted = submittedNamesBySide.get(sub.side) ?? new Set<string>();
    for (const item of sub.items) {
      submitted.add(item.itemName);
    }
    submittedNamesBySide.set(sub.side, submitted);
    if (sub.status !== "approved") continue;
    approvedSubCountBySide.set(
      sub.side,
      (approvedSubCountBySide.get(sub.side) ?? 0) + 1,
    );
    const byItem =
      approvedQtyBySideAndItem.get(sub.side) ?? new Map<string, number>();
    for (const item of sub.items) {
      byItem.set(
        item.itemName,
        (byItem.get(item.itemName) ?? 0) + item.quantity,
      );
    }
    approvedQtyBySideAndItem.set(sub.side, byItem);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-start justify-between p-5 border-b-2 ${borderColor}`}
        >
          <div className="flex items-center gap-4">
            {imgSrc && !imgFailed && (
              <img
                src={imgSrc}
                alt={tile.name}
                onError={() => setImgFailed(true)}
                className="w-16 h-16 object-contain shrink-0"
              />
            )}
            <div>
              <h2 className="text-white text-xl font-bold">{tile.name}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span
                  className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 capitalize ${badgeColor}`}
                >
                  {tile.badgeCategory.replace("_", " ")}
                </span>
                <span className="text-yellow-400 text-sm font-semibold">
                  {progress ? `${claimedPts}/` : ""}
                  {tile.totalPoints} pts
                </span>
                {tile.hasFreezePeriod && (
                  <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2.5 py-0.5">
                    ⏱ 2hr freeze
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onSubmit && (
              <button
                onClick={submitDisabled ? undefined : onSubmit}
                disabled={submitDisabled}
                className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded px-3 py-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Submit
              </button>
            )}
            <button
              className="text-slate-400 hover:text-white text-lg leading-none p-1 cursor-pointer"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Sides */}
        <div className="grid grid-cols-2 divide-x divide-slate-700">
          {tile.sides.A && (
            <SidePanel
              side={tile.sides.A}
              label="Part A"
              approvedByItemName={
                approvedQtyBySideAndItem.get("A") ?? new Map()
              }
              submittedItemNames={submittedNamesBySide.get("A") ?? new Set()}
              approvedSubmissionCount={approvedSubCountBySide.get("A") ?? 0}
              complete={progress?.sideAStatus === "completed"}
            />
          )}
          {tile.sides.B &&
            (() => {
              const crossSide =
                tile.sides.B.requiresNoDuplicates &&
                tile.sides.A?.requiresNoDuplicates;
              const bSubmitted =
                submittedNamesBySide.get("B") ?? new Set<string>();
              const bApproved =
                approvedQtyBySideAndItem.get("B") ?? new Map<string, number>();
              const effectiveSubmitted = crossSide
                ? new Set([
                    ...bSubmitted,
                    ...(submittedNamesBySide.get("A") ?? []),
                  ])
                : bSubmitted;
              return (
                <SidePanel
                  side={tile.sides.B}
                  label="Part B"
                  approvedByItemName={bApproved}
                  submittedItemNames={effectiveSubmitted}
                  approvedSubmissionCount={approvedSubCountBySide.get("B") ?? 0}
                  locked={progress?.sideAStatus !== "completed"}
                  complete={progress?.sideBStatus === "completed"}
                />
              );
            })()}
        </div>

        {/* Team submissions summary */}
        {submissions && submissions.length > 0 && (
          <div className="p-5 border-t border-slate-700">
            <h4 className="text-slate-400 text-xs uppercase tracking-wide mb-3">
              Submissions
            </h4>
            {(["A", "B"] as const).map((side) => {
              const sideSubs = submissions.filter((s) => s.side === side);
              if (!sideSubs.length) return null;
              return (
                <div key={side} className="mb-3 last:mb-0">
                  <p className="text-xs font-semibold text-slate-400 mb-1">
                    Part {side}
                  </p>
                  {sideSubs.map((sub) => (
                    <SubmissionRow key={sub.id} sub={sub} />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Wildcards */}
        {tile.wildcards.length > 0 && (
          <div className="p-5 border-t border-slate-700">
            <h4 className="text-slate-400 text-xs uppercase tracking-wide mb-3">
              Wildcards
            </h4>
            <div className="space-y-2">
              {tile.wildcards.map((wc) => (
                <div
                  key={wc.id}
                  className="flex items-baseline gap-2 flex-wrap"
                >
                  <span className="text-yellow-400 text-sm font-semibold">
                    {wc.itemName}
                  </span>
                  <span className="text-slate-300 text-sm">
                    {wc.description}
                  </span>
                  {wc.applicableToSide && (
                    <span className="text-xs text-slate-500 bg-slate-900 rounded-full px-2 py-0.5">
                      Part {wc.applicableToSide} only
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

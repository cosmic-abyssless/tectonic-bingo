import { useEffect, useState } from "react";
import type {
  BoardTile,
  TileSide,
  TileSideItem,
  TileProgress,
  SubmissionSummary,
} from "../types";
import { TILE_IMAGES } from "../tileImages";

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

function groupItems(items: TileSideItem[]) {
  const required: TileSideItem[] = [];
  const grouped = new Map<string, TileSideItem[]>();
  for (const item of items) {
    if (!item.optionsGroup) {
      required.push(item);
    } else {
      const list = grouped.get(item.optionsGroup) ?? [];
      list.push(item);
      grouped.set(item.optionsGroup, list);
    }
  }
  return { required, grouped };
}

function ItemProgress({
  item,
  approvedQty,
}: {
  item: TileSideItem;
  approvedQty: number;
}) {
  if (item.quantity <= 1) return null;
  const done = approvedQty >= item.quantity;
  return (
    <span
      className={`font-semibold text-xs tabular-nums ${done ? "text-green-400" : "text-yellow-400"}`}
    >
      {approvedQty}/{item.quantity}
    </span>
  );
}

function SidePanel({
  side,
  label,
  approvedByItemName,
  submittedItemNames,
  approvedSubmissionCount,
  locked,
  complete,
}: {
  side: TileSide;
  label: string;
  approvedByItemName: Map<string, number>;
  submittedItemNames: Set<string>;
  approvedSubmissionCount: number;
  locked?: boolean;
  complete?: boolean;
}) {
  const { required, grouped } = groupItems(side.items);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-bold text-sm">{label}</span>
          {complete && (
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
          )}
          {locked && (
            <div className="relative group/lock">
              <svg
                className="w-3.5 h-3.5 text-slate-400 cursor-default"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 hidden group-hover/lock:block bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 shadow-xl z-30 leading-relaxed">
                {side.requiresPartA
                  ? "Part B cannot be submitted until Part A is completed."
                  : "Points for Part B are only awarded after Part A is completed. You can submit for Part B at any time."}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {side.minSubmissions > 1 && !complete && (
            <span
              className={`text-xs tabular-nums font-semibold ${
                approvedSubmissionCount >= side.minSubmissions
                  ? "text-green-400"
                  : "text-yellow-400"
              }`}
              title={`${approvedSubmissionCount} of ${side.minSubmissions} required submissions approved`}
            >
              {approvedSubmissionCount}/{side.minSubmissions}
            </span>
          )}
          <span className="text-yellow-400 font-semibold text-sm">
            {side.points} pts
          </span>
        </div>
      </div>

      <p className="text-slate-300 text-sm leading-relaxed mb-3">
        {side.description}
      </p>

      {required.length > 0 && (
        <ul className="space-y-1 mb-2">
          {required.map((item) => {
            const submitted = submittedItemNames.has(item.itemName);
            const approved = (approvedByItemName.get(item.itemName) ?? 0) > 0;
            return (
              <li
                key={item.id}
                className={`flex items-baseline gap-2 text-sm ${submitted ? "text-slate-500 line-through" : "text-slate-200"}`}
              >
                <span className="text-indigo-400 text-xs">▸</span>
                <ItemProgress
                  item={item}
                  approvedQty={approvedByItemName.get(item.itemName) ?? 0}
                />
                {item.itemName}
                {approved && (
                  <svg className="w-3 h-3 text-green-400 shrink-0 no-underline" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {[...grouped.entries()].map(([group, opts]) => (
        <div key={group} className="mt-2">
          <span className="text-slate-500 text-xs uppercase tracking-wide">
            Choose one:
          </span>
          <ul className="space-y-1 mt-1">
            {opts.map((item) => {
              const submitted = submittedItemNames.has(item.itemName);
              const approved = (approvedByItemName.get(item.itemName) ?? 0) > 0;
              return (
                <li
                  key={item.id}
                  className={`flex items-baseline gap-2 text-sm ${submitted ? "text-slate-500 line-through" : "text-slate-300"}`}
                >
                  <span className="text-slate-500 text-xs">◦</span>
                  <ItemProgress
                    item={item}
                    approvedQty={approvedByItemName.get(item.itemName) ?? 0}
                  />
                  {item.itemName}
                  {approved && (
                    <svg className="w-3 h-3 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {(side.requiresNoDuplicates ||
        side.allowsPreviouslyAcquired ||
        side.allowsPreLoad) && (
        <div className="flex gap-2 flex-wrap mt-3">
          {side.requiresNoDuplicates && (
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
              No duplicates
            </span>
          )}
          {side.allowsPreviouslyAcquired && (
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
              Prev. acquired OK
            </span>
          )}
          {side.allowsPreLoad && (
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
              Pre-load allowed
            </span>
          )}
        </div>
      )}

      {side.notes && (
        <p className="mt-3 text-xs text-amber-400 border-l-2 border-amber-500 pl-2">
          {side.notes}
        </p>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<
  SubmissionSummary["status"],
  { label: string; cls: string }
> = {
  pending: {
    label: "Pending",
    cls: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  },
  approved: {
    label: "Approved",
    cls: "bg-green-900/50  text-green-300  border-green-700",
  },
  rejected: {
    label: "Rejected",
    cls: "bg-red-900/50    text-red-300    border-red-700",
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function SubmissionRow({ sub }: { sub: SubmissionSummary }) {
  const { label, cls } = STATUS_STYLE[sub.status];
  const thumb = sub.screenshots[0]?.url;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-700/50 last:border-0">
      {/* Thumbnail */}
      {thumb ? (
        <a
          href={thumb}
          target="_blank"
          rel="noreferrer"
          className="shrink-0"
          title="View screenshot"
        >
          <img
            src={thumb}
            alt="screenshot"
            className="w-12 h-12 object-cover rounded border border-slate-600 hover:border-indigo-400 transition-colors"
          />
        </a>
      ) : (
        <div className="w-12 h-12 rounded border border-slate-700 bg-slate-900/50 shrink-0 flex items-center justify-center text-slate-600 text-xs">
          —
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span
            className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${cls}`}
          >
            {label}
          </span>
          <span className="text-xs text-slate-500">
            {timeAgo(sub.submittedAt)}
          </span>
        </div>
        <p className="text-sm text-slate-200 truncate">
          {sub.items
            .map((i) =>
              i.targetQuantity > 1
                ? `${i.quantity}× ${i.itemName}`
                : i.itemName,
            )
            .join(", ")}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">by {sub.submittedBy}</p>
        {sub.reviewerNotes && (
          <p className="text-xs text-amber-400 mt-0.5 truncate">
            {sub.reviewerNotes}
          </p>
        )}
      </div>
    </div>
  );
}

interface Props {
  tile: BoardTile;
  onClose: () => void;
  onSubmit?: () => void;
  progress?: TileProgress;
  submissions?: SubmissionSummary[];
}

export function TileModal({
  tile,
  onClose,
  onSubmit,
  progress,
  submissions,
}: Props) {
  const badgeColor =
    BADGE_COLORS[tile.badgeCategory] ??
    "text-slate-400 border-slate-500 bg-slate-500/10";
  const borderColor = BADGE_BORDER[tile.badgeCategory] ?? "border-slate-500";
  const imgSrc = TILE_IMAGES[tile.name];
  const [imgFailed, setImgFailed] = useState(false);

  const claimedPts =
    (progress?.sideAPointsAwarded ?? 0) + (progress?.sideBPointsAwarded ?? 0);

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
                onClick={onSubmit}
                className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded px-3 py-1 transition-colors cursor-pointer"
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
          {tile.sides.B && (() => {
            const crossSide = tile.sides.B.requiresNoDuplicates && tile.sides.A?.requiresNoDuplicates;
            const bSubmitted = submittedNamesBySide.get("B") ?? new Set<string>();
            const bApproved = approvedQtyBySideAndItem.get("B") ?? new Map<string, number>();
            // Cross-side strikethrough: show Part A submitted items as struck in Part B
            // so it's clear they can't be re-selected.
            const effectiveSubmitted = crossSide
              ? new Set([...bSubmitted, ...(submittedNamesBySide.get("A") ?? [])])
              : bSubmitted;
            // Do NOT merge Part A approved quantities — the green check should only
            // appear for items actually approved for Part B, not Part A carries-over.
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

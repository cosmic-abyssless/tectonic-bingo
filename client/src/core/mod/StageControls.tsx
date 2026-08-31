import { useState } from "react";
import { STAGE_ORDER, type Bingo } from "@bingo/shared";
import { useAdvanceStage } from "../../api/queries";

export function StageControls({ slug, bingo }: { slug: string; bingo: Bingo }) {
  const advanceStage = useAdvanceStage(slug);
  const [confirming, setConfirming] = useState<"forward" | "back" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const idx = STAGE_ORDER.indexOf(bingo.stage);
  const nextStage = idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  const prevStage = idx > 0 ? STAGE_ORDER[idx - 1] : null;

  async function go(toStage: typeof STAGE_ORDER[number]) {
    setError(null);
    try {
      await advanceStage.mutateAsync(toStage);
      setConfirming(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to change stage");
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Current stage</p>
          <p className="text-white font-bold text-lg capitalize">{bingo.stage}</p>
        </div>
        <div className="flex gap-2">
          {prevStage && (
            <button
              onClick={() => setConfirming("back")}
              className="text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1.5 transition-colors cursor-pointer"
            >
              ← Back to {prevStage}
            </button>
          )}
          {nextStage && (
            <button
              onClick={() => setConfirming("forward")}
              className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded px-3 py-1.5 transition-colors cursor-pointer"
            >
              Advance to {nextStage} →
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

      {confirming && (
        <div className="mt-3 flex items-center gap-3 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5">
          <p className="text-sm text-slate-300 flex-1">
            Move this bingo from <span className="font-semibold capitalize">{bingo.stage}</span> to{" "}
            <span className="font-semibold capitalize">{confirming === "forward" ? nextStage : prevStage}</span>?
          </p>
          <button
            onClick={() => setConfirming(null)}
            className="text-sm text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 rounded px-3 py-1 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => go((confirming === "forward" ? nextStage : prevStage)!)}
            disabled={advanceStage.isPending}
            className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded px-3 py-1 transition-colors cursor-pointer"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useLines } from "../../api/adminQueries";

export function LineEditor({ slug }: { slug: string }) {
  const { data } = useLines(slug);
  const lines = data?.lines ?? [];
  const queryClient = useQueryClient();
  const [pointsPerLine, setPointsPerLine] = useState(15);
  const [generating, setGenerating] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.lines(slug) });

  async function generate() {
    setGenerating(true);
    try {
      await adminApi.generateLines(slug, pointsPerLine);
      invalidate();
    } finally {
      setGenerating(false);
    }
  }
  async function updatePoints(id: string, points: number) {
    await adminApi.updateLine(slug, id, points);
    invalidate();
  }
  async function remove(id: string) {
    await adminApi.deleteLine(slug, id);
    invalidate();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Points per line</label>
          <input type="number" value={pointsPerLine} onChange={(e) => setPointsPerLine(Number(e.target.value) || 0)} className="w-28 bg-slate-900 border border-slate-600 text-white rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <button onClick={generate} disabled={generating} className="text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2 transition-colors cursor-pointer">
          {generating ? "Generating…" : "Generate lines from board"}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Generates every row, column, and (if the board is square) both diagonals from the current tile layout. Re-running replaces the existing lines — do it again after resizing the board.
      </p>

      {lines.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 text-xs uppercase">
              <th className="pb-2">Line</th>
              <th className="pb-2 w-28">Points</th>
              <th className="pb-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5 text-slate-200 capitalize">
                  {line.lineType} {line.lineIndex + 1}
                </td>
                <td className="py-1.5">
                  <input
                    type="number"
                    defaultValue={line.points}
                    onBlur={(e) => updatePoints(line.id, Number(e.target.value) || 0)}
                    className="w-20 bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </td>
                <td className="py-1.5">
                  <button onClick={() => remove(line.id)} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

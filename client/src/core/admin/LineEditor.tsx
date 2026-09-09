import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useLines } from "../../api/adminQueries";
import { Button, IconButton } from "../ui/Button";
import { Field, Input, controlClass } from "../ui/Field";
import { XIcon } from "../ui/icons";

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
        <Field label="Points per line">
          <Input type="number" value={pointsPerLine} onChange={(e) => setPointsPerLine(Number(e.target.value) || 0)} className="num w-28" />
        </Field>
        <Button variant="primary" onPress={generate} isDisabled={generating}>
          {generating ? "Generating…" : "Generate lines from board"}
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">
        Generates every row, column, and (if the board is square) both diagonals from the current tile layout. Re-running replaces the existing lines — do it again after resizing the board.
      </p>

      {lines.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
              <th className="pb-2 font-medium">Line</th>
              <th className="w-28 pb-2 font-medium">Points</th>
              <th className="w-10 pb-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5 capitalize text-fg">
                  {line.lineType} {line.lineIndex + 1}
                </td>
                <td className="py-1.5">
                  <input
                    type="number"
                    defaultValue={line.node.points}
                    onBlur={(e) => updatePoints(line.id, Number(e.target.value) || 0)}
                    className={`${controlClass("sm")} num w-20`}
                  />
                </td>
                <td className="py-1.5">
                  <IconButton label={`Delete ${line.lineType} ${line.lineIndex + 1}`} size="sm" onPress={() => remove(line.id)}>
                    <XIcon size={12} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

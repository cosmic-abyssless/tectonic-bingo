import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { validateHistoricalBundle, type HistoricalBundle } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys } from "../../api/queries";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";

/**
 * Site admin → Import historical Bingo (CONTEXT.md "Historical Bingo"): a bundle made by the local script
 * (server/scripts/historical/) becomes a new, read-only Historical Bingo. The file is checked here first, so its
 * problems show before the upload; the server checks it again, with what only it knows (a taken slug, say).
 */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A rich bundle's sections (version 2), or null for a sparse one. */
function richSummary(bundle: HistoricalBundle): string | null {
  const tasks = bundle.tiles.reduce((n, t) => n + (t.tasks?.length ?? 0), 0);
  const cut = bundle.signups?.entries.filter((e) => e.cut).length ?? 0;
  const parts = [
    tasks > 0 && plural(tasks, "Task"),
    bundle.lines?.length && plural(bundle.lines.length, "Line"),
    bundle.submissions?.length && plural(bundle.submissions.length, "Submission"),
    bundle.signups && `${plural(bundle.signups.entries.length, "Signup")}${cut > 0 ? ` (${cut} cut)` : ""}`,
    bundle.draft && `a Draft of ${plural(bundle.draft.picks.length, "pick")}`,
  ].filter((p): p is string => typeof p === "string");
  return parts.length > 0 ? parts.join(", ") : null;
}

export function ImportHistoricalBingoPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [bundle, setBundle] = useState<HistoricalBundle | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(file: File) {
    setError(null);
    setBundle(null);
    setProblems([]);
    setFileName(file.name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError("That file isn't valid JSON");
      return;
    }
    // Made-up test ids are only allowed by a dev server; the server has the last word.
    const check = validateHistoricalBundle(parsed, { devDiscordIds: true });
    if (check.ok) setBundle(check.bundle);
    else setProblems(check.problems);
  }

  async function doImport() {
    if (!bundle) return;
    setImporting(true);
    setError(null);
    try {
      const { bingo } = await adminApi.importHistoricalBingo(bundle);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bingos() });
      navigate(`/b/${bingo.slug}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to import the bundle");
    } finally {
      setImporting(false);
    }
  }


  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-on-surface-muted">
        Add a past Bingo that ran on another website, from a historical bundle. It's created Finished and read-only. To import one again, delete it first.
      </p>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full rounded-md border border-dashed border-outline-strong px-3 py-4 text-center text-sm text-on-surface-muted transition-colors hover:border-on-surface/60 hover:text-on-surface"
      >
        {fileName || "Choose a historical bundle…"}
      </button>
      <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onFileChange(e.target.files[0])} />

      {bundle && (
        <div className="space-y-1 text-sm">
          <p className="font-medium text-on-surface">{bundle.bingo.name}</p>
          <p className="font-mono text-xs text-on-surface-muted">/b/{bundle.bingo.slug}</p>
          <p className="text-xs text-on-surface-subtle">
            {bundle.bingo.boardRows}x{bundle.bingo.boardCols} board, {plural(bundle.teams.length, "Team")}, {plural(bundle.players.length, "Player")}
            {bundle.unknownPlayers.length > 0 && `, ${bundle.unknownPlayers.length} unknown`}
            {bundle.wom ? ", a Wise Old Man competition" : ""}
          </p>
          {richSummary(bundle) && <p className="text-xs text-on-surface-subtle">{richSummary(bundle)}</p>}
        </div>
      )}
      {problems.length > 0 && (
        <Notice tone="danger">
          <p className="mb-1">
            <strong>This bundle can't be imported:</strong>
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      )}
      {error && (
        <Notice tone="danger">
          <p className="whitespace-pre-line">{error}</p>
        </Notice>
      )}
      <Button variant="primary" onPress={doImport} isDisabled={!bundle || importing} className="w-full">
        {importing ? "Importing…" : "Import historical Bingo"}
      </Button>
    </div>
  );
}

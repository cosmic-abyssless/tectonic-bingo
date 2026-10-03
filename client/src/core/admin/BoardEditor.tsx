import { ExclusiveItemsProvider } from "./exclusiveItems";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isBoardEditingLocked, type Bingo, type DraftBoardResponse, type Tile } from "@bingo/shared";
import { adminQueryKeys, optimisticDraftBoard, useBoardDraft } from "../../api/adminQueries";
import * as adminApi from "../../api/adminApi";
import { previewGraphNode } from "../board/requirementTree";
import { Notice } from "../ui/Card";
import { LockIcon, PlusIcon } from "../ui/icons";
import { CategoryEditor } from "./CategoryEditor";
import { thumbUrl } from "../../api/imageVariants";
import { TileEditorPanel } from "./TileEditorPanel";
import { UnpublishedChangesBar } from "./UnpublishedChangesBar";
import { BoardRulesEditor } from "./BoardRulesEditor";

// The board the editor shows and edits is the Draft board (CONTEXT.md "Draft board"): every change goes to it, and
// Players see it once an Admin publishes it from the bar at the top.
export function BoardEditor({ slug, bingo }: { slug: string; bingo: Bingo }) {
  const { data: draft } = useBoardDraft(slug);
  const tiles = draft?.board.tiles ?? [];
  const categories = draft?.categories ?? [];
  const queryClient = useQueryClient();
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mirrors the server's assertBoardEditable gate: editable through live, locked once complete.
  const locked = isBoardEditingLocked(bingo.stage);
  const lockedReason = !locked
    ? null
    : bingo.historical
      ? "This is a Historical Bingo, imported from another website: its Board can be looked through but not changed."
      : "The board is locked because the bingo is complete. Step the stage back to edit it.";

  const grid = new Map<string, Tile>();
  for (const tile of tiles) grid.set(`${tile.boardRow},${tile.boardCol}`, tile);
  const selectedTile = tiles.find((t) => t.id === selectedTileId) ?? null;

  // The tile shows up on the grid immediately as a placeholder; the editor
  // only opens once the server has handed back the real id.
  async function createAt(row: number, col: number) {
    setError(null);
    const placeholder: Tile = {
      id: `pending-${crypto.randomUUID()}`,
      bingoId: bingo.id,
      nodeId: "",
      name: "New Tile",
      imageUrl: null,
      categoryId: null,
      boardRow: row,
      boardCol: col,
      hasFreezePeriod: false,
      freezeDurationMinutes: 0,
      notes: null,
      requiresProof: false,
      proofNote: null,
      rulesText: null,
      createdAt: new Date().toISOString(),
      node: previewGraphNode(bingo.id, { kind: "ALL" }),
    };
    try {
      await optimisticDraftBoard(
        queryClient,
        slug,
        (board) => ({ ...board, tiles: [...board.tiles, placeholder] }),
        async () => {
          const { tile } = await adminApi.createTile(slug, { name: placeholder.name, boardRow: row, boardCol: col });
          // Swap the placeholder for the real row so the editor can open before the
          // refetch lands. POST /tiles returns the bare row, so keep the empty node.
          queryClient.setQueryData<DraftBoardResponse>(adminQueryKeys.boardDraft(slug), (draft) =>
            draft && { ...draft, board: { ...draft.board, tiles: draft.board.tiles.map((t) => (t.id === placeholder.id ? { ...tile, node: placeholder.node } : t)) } },
          );
          setSelectedTileId(tile.id);
        },
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create tile");
    }
  }

  return (
    <ExclusiveItemsProvider value={draft?.exclusivityRules ?? bingo.exclusivityRules}>
    <div className="space-y-6">
      {draft && !bingo.historical && <UnpublishedChangesBar slug={slug} bingo={bingo} draft={draft} locked={locked} />}
      {lockedReason && (
        <Notice tone="warn" icon={<LockIcon />}>
          {lockedReason}
        </Notice>
      )}
      {bingo.stage === "live" && (
        <Notice tone="info">
          The bingo is live: changes reach Players, and rescore every Team, only once they're published. Removing an Item teams have claimed stops their Claims counting (the Publish screen
          says how many); a requirement a Proof screenshot was posted for can be edited but not removed.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      {/* A disabled fieldset inertly disables every control inside it. */}
      <fieldset disabled={locked} className="min-w-0 disabled:opacity-60">
        <CategoryEditor slug={slug} categories={categories} />
      </fieldset>

      <div>
        <p className="mb-2 text-sm font-medium text-on-surface">
          Board <span className="num text-on-surface-subtle">({bingo.boardRows}×{bingo.boardCols})</span>
        </p>
        <div className="grid w-full max-w-3xl gap-1" style={{ gridTemplateColumns: `repeat(${bingo.boardCols}, minmax(70px, 1fr))` }}>
          {Array.from({ length: bingo.boardRows }, (_, row) =>
            Array.from({ length: bingo.boardCols }, (_, col) => {
              const tile = grid.get(`${row},${col}`);
              const category = tile?.categoryId ? categories.find((c) => c.id === tile.categoryId) : undefined;
              const pending = tile?.id.startsWith("pending-") ?? false;
              return tile ? (
                <button
                  key={`${row},${col}`}
                  aria-label={`Edit tile at row ${row}, column ${col}: ${tile.name}`}
                  disabled={pending}
                  onClick={() => setSelectedTileId(tile.id)}
                  style={category?.colorHex ? { borderColor: category.colorHex } : undefined}
                  className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-md border-2 border-outline-strong bg-surface p-1 text-center transition-colors hover:bg-surface-hover disabled:opacity-60"
                >
                  {tile.imageUrl && <img src={thumbUrl(tile.imageUrl)} alt="" className="mb-0.5 size-8 object-contain" />}
                  <span className="line-clamp-2 text-[10px] leading-tight text-on-surface">{tile.name}</span>
                  <span className="num text-[9px] text-on-surface-subtle">
                    {tile.node.children.length} task{tile.node.children.length !== 1 ? "s" : ""}
                  </span>
                </button>
              ) : (
                <button
                  key={`${row},${col}`}
                  aria-label={`Create tile at row ${row}, column ${col}`}
                  disabled={locked}
                  onClick={() => createAt(row, col)}
                  className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-outline text-on-surface-subtle transition-colors hover:border-outline-strong hover:text-on-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PlusIcon />
                </button>
              );
            }),
          )}
        </div>
      </div>

      <TileEditorPanel slug={slug} themeKey={bingo.theme} tile={selectedTile} categories={categories} locked={lockedReason} onClose={() => setSelectedTileId(null)} />

      {draft && !bingo.historical && <BoardRulesEditor slug={slug} rulesMarkdown={draft.rulesMarkdown} exclusivityRules={draft.exclusivityRules} locked={locked} />}
    </div>
    </ExclusiveItemsProvider>
  );
}

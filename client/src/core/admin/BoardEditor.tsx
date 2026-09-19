import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isBoardEditingLocked, type Bingo, type BoardResponse, type Tile, type TileCategory } from "@bingo/shared";
import { useBoard, queryKeys } from "../../api/queries";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { previewGraphNode } from "../board/requirementTree";
import { Notice } from "../ui/Card";
import { LockIcon, PlusIcon } from "../ui/icons";
import { CategoryEditor } from "./CategoryEditor";
import { thumbUrl } from "../../api/imageVariants";
import { TileEditorPanel } from "./TileEditorPanel";

export function BoardEditor({ slug, bingo, categories }: { slug: string; bingo: Bingo; categories: TileCategory[] }) {
  const { data } = useBoard(slug);
  const tiles = data?.tiles ?? [];
  const queryClient = useQueryClient();
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mirrors the server's assertBoardEditable gate: editable through live, locked once complete.
  const locked = isBoardEditingLocked(bingo.stage);
  const live = bingo.stage === "live";

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
      createdAt: new Date().toISOString(),
      node: previewGraphNode(bingo.id, { kind: "ALL" }),
    };
    try {
      await optimisticUpdate<BoardResponse>(
        queryClient,
        queryKeys.board(slug),
        (board) => ({ ...board, tiles: [...board.tiles, placeholder] }),
        async () => {
          const { tile } = await adminApi.createTile(slug, { name: placeholder.name, boardRow: row, boardCol: col });
          // Swap the placeholder for the real row so the editor can open before the
          // refetch lands. POST /tiles returns the bare row, so keep the empty node.
          queryClient.setQueryData<BoardResponse>(queryKeys.board(slug), (board) =>
            board && { ...board, tiles: board.tiles.map((t) => (t.id === placeholder.id ? { ...tile, node: placeholder.node } : t)) },
          );
          setSelectedTileId(tile.id);
        },
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create tile");
    }
  }

  return (
    <div className="space-y-6">
      {locked && (
        <Notice tone="warn" icon={<LockIcon />}>
          The board is locked because the bingo is complete. Step the stage back to edit it.
        </Notice>
      )}
      {live && (
        <Notice tone="warn">
          The bingo is live: changes apply immediately for everyone and re-score every team. A requirement teams have already submitted proof for can be edited but not removed.
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

      <TileEditorPanel slug={slug} tile={selectedTile} categories={categories} locked={locked} onClose={() => setSelectedTileId(null)} />
    </div>
  );
}

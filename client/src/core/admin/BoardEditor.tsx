import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isBoardLocked, type Bingo, type Tile, type TileCategory } from "@bingo/shared";
import { useBoard } from "../../api/queries";
import { queryKeys } from "../../api/queries";
import * as adminApi from "../../api/adminApi";
import { Notice } from "../ui/Card";
import { LockIcon, PlusIcon } from "../ui/icons";
import { CategoryEditor } from "./CategoryEditor";
import { TileEditorPanel } from "./TileEditorPanel";

export function BoardEditor({ slug, bingo, categories }: { slug: string; bingo: Bingo; categories: TileCategory[] }) {
  const { data } = useBoard(slug);
  const tiles = data?.tiles ?? [];
  const queryClient = useQueryClient();
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mirrors the server's assertBoardEditable gate.
  const locked = isBoardLocked(bingo.stage);

  const grid = new Map<string, Tile>();
  for (const tile of tiles) grid.set(`${tile.boardRow},${tile.boardCol}`, tile);
  const selectedTile = tiles.find((t) => t.id === selectedTileId) ?? null;

  async function createAt(row: number, col: number) {
    setCreating(true);
    setError(null);
    try {
      const { tile } = await adminApi.createTile(slug, { name: "New Tile", boardRow: row, boardCol: col });
      await queryClient.invalidateQueries({ queryKey: queryKeys.board(slug) });
      setSelectedTileId(tile.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create tile");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {locked && (
        <Notice tone="warn" icon={<LockIcon />}>
          The board is locked once the game is live (current stage: {bingo.stage}). Step the stage back to edit it.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      {/* A disabled fieldset inertly disables every control inside it. */}
      <fieldset disabled={locked} className="min-w-0 disabled:opacity-60">
        <CategoryEditor slug={slug} categories={categories} />
      </fieldset>

      <div>
        <p className="mb-2 text-sm font-medium text-fg">
          Board <span className="num text-fg-subtle">({bingo.boardRows}×{bingo.boardCols})</span>
        </p>
        <div className="grid w-full max-w-3xl gap-1" style={{ gridTemplateColumns: `repeat(${bingo.boardCols}, minmax(70px, 1fr))` }}>
          {Array.from({ length: bingo.boardRows }, (_, row) =>
            Array.from({ length: bingo.boardCols }, (_, col) => {
              const tile = grid.get(`${row},${col}`);
              const category = tile?.categoryId ? categories.find((c) => c.id === tile.categoryId) : undefined;
              return tile ? (
                <button
                  key={`${row},${col}`}
                  aria-label={`Edit tile at row ${row}, column ${col}: ${tile.name}`}
                  onClick={() => setSelectedTileId(tile.id)}
                  style={category?.colorHex ? { borderColor: category.colorHex } : undefined}
                  className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-md border-2 border-line-strong bg-surface p-1 text-center transition-colors hover:bg-surface-hover"
                >
                  {tile.imageUrl && <img src={tile.imageUrl} alt="" className="mb-0.5 size-8 object-contain" />}
                  <span className="line-clamp-2 text-[10px] leading-tight text-fg">{tile.name}</span>
                  <span className="num text-[9px] text-fg-subtle">
                    {tile.node.children.length} task{tile.node.children.length !== 1 ? "s" : ""}
                  </span>
                </button>
              ) : (
                <button
                  key={`${row},${col}`}
                  aria-label={`Create tile at row ${row}, column ${col}`}
                  disabled={creating || locked}
                  onClick={() => createAt(row, col)}
                  className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed border-line text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60"
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

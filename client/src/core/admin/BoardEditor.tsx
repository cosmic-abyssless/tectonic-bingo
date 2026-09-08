import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isBoardLocked, type Bingo, type Tile, type TileCategory } from "@bingo/shared";
import { useBoard } from "../../api/queries";
import { queryKeys } from "../../api/queries";
import * as adminApi from "../../api/adminApi";
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
        <p className="text-sm text-amber-300 bg-amber-900/30 border border-amber-800 rounded-md px-3 py-2">
          The board is locked once the game is live (current stage: {bingo.stage}). Step the stage back to edit it.
        </p>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* A disabled fieldset inertly disables every control inside it. */}
      <fieldset disabled={locked} className="min-w-0 disabled:opacity-60">
        <CategoryEditor slug={slug} categories={categories} />
      </fieldset>

      <div>
        <p className="text-sm font-medium text-slate-300 mb-2">
          Board ({bingo.boardRows}×{bingo.boardCols})
        </p>
        <div className="grid gap-1 w-full max-w-3xl" style={{ gridTemplateColumns: `repeat(${bingo.boardCols}, minmax(70px, 1fr))` }}>
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
                  className="aspect-square bg-slate-800 border-2 border-slate-700 rounded-md p-1 flex flex-col items-center justify-center text-center hover:border-indigo-500 transition-colors cursor-pointer overflow-hidden"
                >
                  {tile.imageUrl && <img src={tile.imageUrl} alt="" className="w-8 h-8 object-contain mb-0.5" />}
                  <span className="text-[10px] text-slate-300 leading-tight line-clamp-2">{tile.name}</span>
                  <span className="text-[9px] text-slate-500">{tile.node.children.length} task{tile.node.children.length !== 1 ? "s" : ""}</span>
                </button>
              ) : (
                <button
                  key={`${row},${col}`}
                  aria-label={`Create tile at row ${row}, column ${col}`}
                  disabled={creating || locked}
                  onClick={() => createAt(row, col)}
                  className="aspect-square bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-md flex items-center justify-center text-slate-600 hover:border-slate-600 hover:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                >
                  +
                </button>
              );
            }),
          )}
        </div>
      </div>

      {selectedTile && <TileEditorPanel slug={slug} tile={selectedTile} categories={categories} locked={locked} onClose={() => setSelectedTileId(null)} />}
    </div>
  );
}

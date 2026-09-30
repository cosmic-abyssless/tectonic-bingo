import { Link } from "react-router-dom";
import { STAGE_LABEL } from "@bingo/shared";
import { useBingos } from "../api/queries";
import { AppHeader } from "../core/ui/AppHeader";
import { Badge, EmptyState } from "../core/ui/Card";
import { HistoricalBadge } from "../core/historical/HistoricalBadge";
import { ChevronRightIcon, GridIcon } from "../core/ui/icons";

export function BingoList() {
  const { data, isLoading, error } = useBingos();

  return (
    <div className="min-h-dvh">
      <AppHeader title="Tectonic Bingo" />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-semibold text-on-surface">Bingos</h1>
        {isLoading && <p className="text-sm text-on-surface-muted">Loading…</p>}
        {error && <p className="text-sm text-danger">{error instanceof Error ? error.message : "Failed to load bingos"}</p>}
        {data?.bingos.length === 0 && (
          <EmptyState icon={<GridIcon />} title="No bingos yet">
            A site admin can create one from the admin page.
          </EmptyState>
        )}
        <ul className="divide-y divide-outline overflow-hidden rounded-lg border border-outline bg-surface">
          {data?.bingos.map((bingo) => (
            <li key={bingo.id}>
              <Link to={`/b/${bingo.slug}`} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-hover">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-on-surface">{bingo.name}</p>
                  {bingo.description && <p className="mt-0.5 truncate text-sm text-on-surface-muted">{bingo.description}</p>}
                </div>
                {bingo.historical && <HistoricalBadge />}
                <Badge tone={bingo.stage === "live" ? "ok" : "neutral"}>{STAGE_LABEL[bingo.stage]}</Badge>
                <ChevronRightIcon className="shrink-0 text-on-surface-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

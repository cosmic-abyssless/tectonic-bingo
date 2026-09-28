import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MAX_SUPERLATIVE_CATEGORIES, type Bingo, type SuperlativeCategory } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { adminQueryKeys, useSuperlativeCategories } from "../../api/adminQueries";
import { useSuperlativeTally, useSuperlativeTurnout } from "../../api/queries";
import { Button, IconButton } from "../ui/Button";
import { Card, EmptyState, Notice } from "../ui/Card";
import { Input } from "../ui/Field";
import { ChevronDownIcon, ChevronUpIcon, ListIcon, XIcon } from "../ui/icons";
import { avatarUrl, displayName } from "../ui/user";

/**
 * Admin management of a Bingo's Superlative categories (CONTEXT.md "Superlative"), with how many of each Team have
 * voted from Live on, and, once it's Finished, every Team's vote counts.
 */
export function SuperlativesManager({ slug, bingo }: { slug: string; bingo: Bingo }) {
  const { data } = useSuperlativeCategories(slug);
  const categories = data?.categories ?? [];
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Each Team's share card fits 3; a Bingo from before the cap keeps its extras but can't add more.
  const full = categories.length >= MAX_SUPERLATIVE_CATEGORIES;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.superlatives(slug) });

  async function add() {
    if (!newName.trim()) return;
    setError(null);
    try {
      await adminApi.createSuperlativeCategory(slug, newName.trim());
      setNewName("");
      invalidate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add category");
    }
  }
  async function rename(id: string, name: string) {
    await adminApi.renameSuperlativeCategory(slug, id, name);
    invalidate();
  }
  function remove(id: string) {
    return optimisticUpdate<{ categories: SuperlativeCategory[] }>(
      queryClient,
      adminQueryKeys.superlatives(slug),
      (d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }),
      () => adminApi.deleteSuperlativeCategory(slug, id),
    );
  }
  function move(index: number, dir: -1 | 1) {
    const reordered = [...categories];
    const [item] = reordered.splice(index, 1);
    reordered.splice(index + dir, 0, item);
    return optimisticUpdate<{ categories: SuperlativeCategory[] }>(
      queryClient,
      adminQueryKeys.superlatives(slug),
      (d) => ({ ...d, categories: reordered }),
      () => adminApi.reorderSuperlativeCategories(slug, reordered.map((c) => c.id)),
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {categories.length === 0 ? (
        <EmptyState icon={<ListIcon />} title="No superlative categories">
          Add up to {MAX_SUPERLATIVE_CATEGORIES} categories below (e.g. "Team MVP", "Team Spirit") for each Team to vote on during Live. With none, no Superlatives show anywhere.
        </EmptyState>
      ) : (
        <div role="list" aria-label="Superlative categories" className="space-y-2">
          {categories.map((c, i) => (
            <Card key={c.id} role="listitem" className="flex items-center gap-2 p-3">
              <div className="flex shrink-0 flex-col">
                <IconButton label="Move up" size="sm" isDisabled={i === 0} onPress={() => move(i, -1)} className="size-5">
                  <ChevronUpIcon size={12} />
                </IconButton>
                <IconButton label="Move down" size="sm" isDisabled={i === categories.length - 1} onPress={() => move(i, 1)} className="size-5">
                  <ChevronDownIcon size={12} />
                </IconButton>
              </div>
              <Input aria-label="Category name" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && rename(c.id, e.target.value.trim())} className="min-w-0 flex-1" />
              <IconButton label="Delete category" size="sm" onPress={() => remove(c.id)} className="hover:text-danger">
                <XIcon size={12} />
              </IconButton>
            </Card>
          ))}
        </div>
      )}

      {full ? (
        <p className="text-xs text-on-surface-muted">
          {categories.length > MAX_SUPERLATIVE_CATEGORIES
            ? `A Bingo can have at most ${MAX_SUPERLATIVE_CATEGORIES} categories, since each Team's share card fits ${MAX_SUPERLATIVE_CATEGORIES}. This one has more from before the limit: they all still work and show in Wrapped, but the Team card shows the first ${MAX_SUPERLATIVE_CATEGORIES}.`
            : `That's the most a Bingo can have: each Team's share card fits ${MAX_SUPERLATIVE_CATEGORIES}. Delete one to add another.`}
        </p>
      ) : (
        <Card className="flex items-center gap-2 p-3">
          <Input
            aria-label="New category"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New category…"
            className="min-w-0 flex-1"
          />
          <Button onPress={add} isDisabled={!newName.trim()} className="shrink-0">
            Add
          </Button>
        </Card>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      {categories.length > 0 && (bingo.stage === "live" || bingo.stage === "complete") && <SuperlativeTurnout slug={slug} />}

      {categories.length > 0 &&
        (bingo.stage === "complete" ? (
          <SuperlativeTallies slug={slug} />
        ) : (
          <p className="text-xs text-on-surface-subtle">Vote counts show here once the Bingo is Finished and voting has closed.</p>
        ))}
    </div>
  );
}

/** How many of each Team's Players have voted, live over the websocket: counts only, never who (votes are secret). */
function SuperlativeTurnout({ slug }: { slug: string }) {
  const { data, isLoading, error } = useSuperlativeTurnout(slug);
  if (isLoading) return null;
  if (error) return <Notice tone="danger">Couldn't load who has voted: {error.message}</Notice>;
  const teams = data?.teams ?? [];
  const players = teams.reduce((n, t) => n + t.players, 0);
  const voted = teams.reduce((n, t) => n + t.votedAny, 0);

  return (
    <div className="space-y-3 pt-2">
      <h3 className="flex items-baseline justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">
        Turnout
        <span className="num normal-case tracking-normal">
          {voted} of {players} voted
        </span>
      </h3>
      {teams.map((team) => (
        <Card key={team.teamId} className="space-y-2 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-on-surface">
              {team.color && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />}
              <span className="truncate">{team.teamName}</span>
            </h4>
            <span className="num shrink-0 text-sm text-on-surface">
              {team.votedAny}/{team.players} voted
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised" role="img" aria-label={`${team.votedAny} of ${team.players} voted`}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${team.players ? (team.votedAny / team.players) * 100 : 0}%` }} />
          </div>
          <p className="text-xs text-on-surface-muted">
            {team.players - team.votedAny} not voted yet · {team.votedAll} voted in every category
          </p>
          <ul className="space-y-0.5">
            {team.categories.map((c) => (
              <li key={c.categoryId} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-on-surface-subtle">{c.categoryName}</span>
                <span className="num shrink-0 text-on-surface-muted">
                  {c.voted}/{team.players}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** Every Team's vote counts per category, once voting has closed (Admin-only; the server refuses this before Finished). */
function SuperlativeTallies({ slug }: { slug: string }) {
  const { data, isLoading, error } = useSuperlativeTally(slug);
  if (isLoading) return null;
  if (error) return <Notice tone="danger">Couldn't load the vote counts: {error.message}</Notice>;
  const teams = data?.teams ?? [];

  return (
    <div className="space-y-3 pt-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">Vote counts</h3>
      {teams.map((team) => (
        <Card key={team.teamId} className="space-y-3 p-3">
          <h4 className="text-sm font-semibold text-on-surface">{team.teamName}</h4>
          {team.tallies.map((tally) => (
            <div key={tally.categoryId}>
              <p className="text-xs font-medium text-on-surface-subtle">{tally.categoryName}</p>
              {tally.counts.length === 0 ? (
                <p className="text-xs text-on-surface-muted">No votes</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {tally.counts.map((c) => (
                    <li key={c.user.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <img src={avatarUrl(c.user)} alt="" className="size-5 shrink-0 rounded-full" />
                        <span className="truncate">{displayName(c.user)}</span>
                      </span>
                      <span className="num shrink-0 text-xs text-on-surface-muted">{c.votes}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

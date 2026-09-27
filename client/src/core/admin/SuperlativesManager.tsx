import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Bingo, SuperlativeCategory } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { adminQueryKeys, useSuperlativeCategories } from "../../api/adminQueries";
import { useSuperlativeTally } from "../../api/queries";
import { Button, IconButton } from "../ui/Button";
import { Card, EmptyState, Notice } from "../ui/Card";
import { Input } from "../ui/Field";
import { ChevronDownIcon, ChevronUpIcon, ListIcon, XIcon } from "../ui/icons";
import { avatarUrl, displayName } from "../ui/user";

/** Admin management of a Bingo's Superlative categories (CONTEXT.md "Superlative"), plus, once it's Finished, every Team's vote counts. */
export function SuperlativesManager({ slug, bingo }: { slug: string; bingo: Bingo }) {
  const { data } = useSuperlativeCategories(slug);
  const categories = data?.categories ?? [];
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

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
          Add categories below (e.g. "Team MVP", "Team Spirit") for each Team to vote on during Live. With none, no Superlatives show anywhere.
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
      {error && <Notice tone="danger">{error}</Notice>}

      {bingo.stage === "complete" && categories.length > 0 && <SuperlativeTallies slug={slug} />}
    </div>
  );
}

/** Every Team's vote counts per category, once voting has closed (Admin-only; the server refuses this before Finished). */
function SuperlativeTallies({ slug }: { slug: string }) {
  const { data, isLoading } = useSuperlativeTally(slug);
  if (isLoading) return null;
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

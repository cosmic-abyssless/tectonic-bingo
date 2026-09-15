import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BingoModerator, User } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { adminQueryKeys, useMods } from "../../api/adminQueries";
import { UserSearchInput } from "./UserSearchInput";
import { displayName } from "../ui/user";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field } from "../ui/Field";

export function ModsManager({ slug }: { slug: string }) {
  const { data } = useMods(slug);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  async function add(user: User) {
    setError(null);
    try {
      await adminApi.addMod(slug, user.id);
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.mods(slug) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add moderator");
    }
  }
  async function remove(userId: string) {
    setError(null);
    try {
      await optimisticUpdate<{ mods: BingoModerator[] }>(
        queryClient,
        adminQueryKeys.mods(slug),
        (d) => ({ mods: d.mods.filter((m) => m.userId !== userId) }),
        () => adminApi.removeMod(slug, userId),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove moderator");
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <Field label="Add a moderator" as="div">
        <UserSearchInput scope={slug} onSelect={add} />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium text-on-surface">
          Current moderators <span className="num text-on-surface-subtle">({data?.mods.length ?? 0})</span>
        </p>
        <ul className="divide-y divide-outline rounded-md border border-outline bg-surface">
          {data?.mods.map((mod) => (
            <li key={mod.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-on-surface">{displayName(mod.user)}</span>
              <Button variant="ghost" size="sm" className="text-danger" onPress={() => remove(mod.userId)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

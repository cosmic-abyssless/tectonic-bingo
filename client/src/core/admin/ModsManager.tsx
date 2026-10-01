import { useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { BingoModerator, User } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { adminQueryKeys, useMods, useStaff } from "../../api/adminQueries";
import { UserSearchInput } from "./UserSearchInput";
import { displayName } from "../ui/user";
import { PlayerName } from "../tectonic/PlayerName";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Field } from "../ui/Field";

export function ModsManager({ slug }: { slug: string }) {
  const { data } = useMods(slug);
  return (
    <RoleHolders
      slug={slug}
      holders={data?.mods}
      queryKey={adminQueryKeys.mods(slug)}
      noun={{ one: "a moderator", many: "moderators" }}
      add={(userId) => adminApi.addMod(slug, userId)}
      remove={(userId) => adminApi.removeMod(slug, userId)}
      listKey="mods"
    />
  );
}

/** Staff (CONTEXT.md "Staff"): clan leadership who collect the Buy-ins, on their own Buy-ins page and nowhere else. */
export function StaffManager({ slug }: { slug: string }) {
  const { data } = useStaff(slug);
  return (
    <RoleHolders
      slug={slug}
      holders={data?.staff}
      queryKey={adminQueryKeys.staff(slug)}
      noun={{ one: "Staff", many: "Staff" }}
      add={(userId) => adminApi.addStaff(slug, userId)}
      remove={(userId) => adminApi.removeStaff(slug, userId)}
      listKey="staff"
      hint="Staff see and mark Buy-ins, from Signups open until the Bingo is Live, and nothing else of the Bingo."
    />
  );
}

/** Who holds a per-Bingo role, with a search to add someone and a Remove for each. */
function RoleHolders({
  slug,
  holders,
  queryKey,
  noun,
  add,
  remove,
  listKey,
  hint,
}: {
  slug: string;
  holders: BingoModerator[] | undefined;
  queryKey: QueryKey;
  noun: { one: string; many: string };
  add: (userId: string) => Promise<unknown>;
  remove: (userId: string) => Promise<unknown>;
  /** The list's key in the response, and in its cached copy: { mods } or { staff }. */
  listKey: string;
  hint?: string;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  async function onAdd(user: User) {
    setError(null);
    try {
      await add(user.id);
      queryClient.invalidateQueries({ queryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to add ${noun.one}`);
    }
  }
  async function onRemove(userId: string) {
    setError(null);
    try {
      await optimisticUpdate<Record<string, BingoModerator[]>>(
        queryClient,
        queryKey,
        (d) => ({ [listKey]: d[listKey]!.filter((h) => h.userId !== userId) }),
        () => remove(userId),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to remove ${noun.one}`);
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <Field label={`Add ${noun.one}`} as="div">
        <UserSearchInput scope={slug} onSelect={onAdd} />
      </Field>
      {hint && <p className="text-sm text-on-surface-muted">{hint}</p>}
      <div>
        <p className="mb-2 text-sm font-medium text-on-surface">
          Current {noun.many} <span className="num text-on-surface-subtle">({holders?.length ?? 0})</span>
        </p>
        <ul className="divide-y divide-outline rounded-md border border-outline bg-surface">
          {holders?.map((holder) => (
            <li key={holder.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <PlayerName userId={holder.userId} className="text-on-surface">
                {displayName(holder.user)}
              </PlayerName>
              <Button variant="ghost" size="sm" className="text-danger" onPress={() => onRemove(holder.userId)}>
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

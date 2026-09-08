import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useMods } from "../../api/adminQueries";
import { UserSearchInput } from "./UserSearchInput";
import { displayName } from "../ui/user";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";

export function ModsManager({ slug }: { slug: string }) {
  const { data } = useMods(slug);
  const queryClient = useQueryClient();

  async function add(user: User) {
    await adminApi.addMod(slug, user.id);
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.mods(slug) });
  }
  async function remove(userId: string) {
    await adminApi.removeMod(slug, userId);
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.mods(slug) });
  }

  return (
    <div className="max-w-md space-y-5">
      <Field label="Add a moderator" as="div">
        <UserSearchInput scope={slug} onSelect={add} />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium text-fg">
          Current moderators <span className="num text-fg-subtle">({data?.mods.length ?? 0})</span>
        </p>
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {data?.mods.map((mod) => (
            <li key={mod.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-fg">{displayName(mod.user)}</span>
              <Button variant="ghost" size="sm" className="text-danger" onPress={() => remove(mod.userId)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

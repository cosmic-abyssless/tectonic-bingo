import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useMods } from "../../api/adminQueries";
import { UserSearchInput } from "./UserSearchInput";
import { displayName } from "../ui/user";

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
    <div className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Add a moderator</label>
        <UserSearchInput scope={slug} onSelect={add} />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-300 mb-2">Current moderators ({data?.mods.length ?? 0})</p>
        <ul className="space-y-1">
          {data?.mods.map((mod) => (
            <li key={mod.id} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm">
              <span className="text-slate-300">{displayName(mod.user)}</span>
              <button onClick={() => remove(mod.userId)} className="text-red-400 hover:text-red-300 text-xs cursor-pointer">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

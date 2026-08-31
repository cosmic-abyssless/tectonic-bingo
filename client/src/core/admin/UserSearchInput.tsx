import { useState } from "react";
import type { User } from "@bingo/shared";
import { useUserSearch } from "../../api/adminQueries";
import { displayName } from "../ui/user";

// scope: a bingo slug (search that bingo's known users) or "site" (global search).
export function UserSearchInput({ scope, onSelect, placeholder = "Search by Discord username…" }: { scope: string; onSelect: (user: User) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const { data, isFetching } = useUserSearch(scope, query);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-500"
      />
      {query.trim() && (
        <div className="mt-1 bg-slate-900 border border-slate-700 rounded-md max-h-48 overflow-y-auto">
          {isFetching ? (
            <div className="px-3 py-2 text-sm text-slate-500">Searching…</div>
          ) : data && data.users.length > 0 ? (
            data.users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  onSelect(user);
                  setQuery("");
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {displayName(user)} <span className="text-slate-500">({user.discordUsername})</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

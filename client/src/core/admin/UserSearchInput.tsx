import { useState } from "react";
import type { User } from "@bingo/shared";
import { useUserSearch } from "../../api/adminQueries";
import { displayName } from "../ui/user";
import { Input } from "../ui/Field";

// scope: a bingo slug (search that bingo's known users) or "site" (global search).
export function UserSearchInput({ scope, onSelect, placeholder = "Search by Discord username…" }: { scope: string; onSelect: (user: User) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const { data, isFetching } = useUserSearch(scope, query);

  return (
    <div className="relative">
      <Input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} className="h-9" />
      {query.trim() && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-line bg-surface-raised">
          {isFetching ? (
            <div className="px-3 py-2 text-sm text-fg-subtle">Searching…</div>
          ) : data && data.users.length > 0 ? (
            data.users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  onSelect(user);
                  setQuery("");
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-fg transition-colors hover:bg-surface-hover"
              >
                {displayName(user)} <span className="text-fg-subtle">({user.discordUsername})</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-fg-subtle">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

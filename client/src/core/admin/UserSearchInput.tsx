import { useContext, useState } from "react";
import type { User } from "@bingo/shared";
import { useUserSearch } from "../../api/adminQueries";
import { displayName } from "../ui/user";
import { FieldLabelContext } from "../ui/Field";
import { SearchCombo } from "../ui/SearchCombo";

// scope: a bingo slug (search that bingo's known users) or "site" (global search). Picking one empties the box.
export function UserSearchInput({ scope, onSelect, placeholder = "Search by Discord username…" }: { scope: string; onSelect: (user: User) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const { data, isFetching } = useUserSearch(scope, query);
  const searching = query.trim() !== "";
  // Outside a <Field>, nothing else names the box.
  const inField = useContext(FieldLabelContext) !== null;

  return (
    <SearchCombo
      items={searching && !isFetching ? (data?.users ?? []) : []}
      itemKey={(user) => user.id}
      itemText={(user) => `${displayName(user)} (${user.discordUsername})`}
      renderItem={(user, { isFocused }) => (
        <span className="truncate">
          {displayName(user)} <span className={isFocused ? "text-on-accent/70" : "text-on-surface-subtle"}>({user.discordUsername})</span>
        </span>
      )}
      onPick={onSelect}
      inputValue={query}
      onInputChange={setQuery}
      clearOnPick
      loading={searching && isFetching}
      emptyText="No matches"
      placeholder={placeholder}
      aria-label={inField ? undefined : placeholder}
    />
  );
}

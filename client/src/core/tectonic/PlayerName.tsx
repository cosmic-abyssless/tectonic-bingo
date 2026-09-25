import { createContext, useCallback, useContext, type ReactNode } from "react";
import type { AccountType } from "@bingo/shared";
import { useAccountTypes } from "../../api/queries";
import { AccountTypeIcon } from "../ui/AccountTypeIcon";
import { useClearUrlParams, useUrlParam } from "../ui/useUrlParam";
import { INTERACTIVE_TEXT } from "../ui/interactiveText";
import { PlayerProfileDialog, PROFILE_TAB_PARAM } from "./PlayerProfileDialog";

const PROFILE_PARAM = "player";
const PROFILE_PARAMS = [PROFILE_PARAM, PROFILE_TAB_PARAM];

const OpenProfileContext = createContext<((userId: string) => void) | null>(null);
const AccountTypesContext = createContext<Record<string, AccountType> | null>(null);

/**
 * Hosts one PlayerProfileDialog per page so any `<PlayerName>` inside can open
 * it, and loads the bingo's account types once so every name can carry its
 * badge. Pages without the provider render names as plain text.
 */
export function PlayerProfileProvider({ slug, children }: { slug: string; children: ReactNode }) {
  // Which profile is open is in the URL (?player=<userId>), so a link opens it. Opening pushes a history entry, so
  // Back closes it.
  const [userId, setUserId] = useUrlParam(PROFILE_PARAM);
  const close = useClearUrlParams(PROFILE_PARAMS);
  const open = useCallback((id: string) => setUserId(id, { push: true }), [setUserId]);
  const { data } = useAccountTypes(slug);
  return (
    <OpenProfileContext.Provider value={open}>
      <AccountTypesContext.Provider value={data?.accountTypes ?? null}>
        {children}
        <PlayerProfileDialog
          slug={slug}
          userId={userId}
          onClose={close}
        />
      </AccountTypesContext.Provider>
    </OpenProfileContext.Provider>
  );
}

/** Opens a player's profile from anywhere under PlayerProfileProvider; null on pages without one. */
export function useOpenProfile(): ((userId: string) => void) | null {
  return useContext(OpenProfileContext);
}

/**
 * The account badge (ironman, UIM, GIM…) before a name: the one given, else the player's from the bingo's account
 * types. "reserve" keeps the badge's width for a player with none, so names in a column line up.
 */
function NameBadge({ userId, accountType, badge }: { userId: string; accountType?: AccountType | null; badge: "show" | "reserve" }) {
  const types = useContext(AccountTypesContext);
  const type = accountType !== undefined ? accountType : (types?.[userId] ?? null);
  const reserve = badge === "reserve";
  if (!reserve && !type) return null;
  return (
    <span className="mr-1 inline-flex">
      <AccountTypeIcon accountType={type} reserveSpace={reserve} />
    </span>
  );
}

/**
 * A player's name that opens their profile, with their account badge before it (see NameBadge). Dotted underline +
 * hover colour mark it as interactive without looking like a navigation link.
 */
export function PlayerName({
  userId,
  children,
  className = "",
  badge = "show",
  accountType,
}: {
  userId: string;
  children: ReactNode;
  className?: string;
  /** "reserve" keeps the badge's width for a player with none (names in a column line up); "none" leaves it off. */
  badge?: "show" | "reserve" | "none";
  /** The player's account type when the caller has it already (the draft pool); otherwise it's looked up. */
  accountType?: AccountType | null;
}) {
  const open = useContext(OpenProfileContext);
  const badgeEl = badge === "none" ? null : <NameBadge userId={userId} accountType={accountType} badge={badge} />;
  if (!open)
    return (
      <span className={className}>
        {badgeEl}
        {children}
      </span>
    );
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(userId);
      }}
      title="View player profile"
      // pb/-mb: room for the underline inside the button's own box, layout unchanged. Where the name is truncated
      // (the draft and signup grids), the box clips its overflow, and at one line's height the underline, 3px
      // below the text, was clipped away with it.
      className={`cursor-pointer rounded-sm border-0 bg-transparent p-0 pb-[4px] -mb-[4px] text-left [font:inherit] [line-height:inherit] ${INTERACTIVE_TEXT} ${className}`}
    >
      {badgeEl}
      {children}
    </button>
  );
}

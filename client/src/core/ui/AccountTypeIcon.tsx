import type { AccountType } from "@bingo/shared";
import ironmanBadge from "./icons/Ironman_chat_badge.png";
import ultimateBadge from "./icons/Ultimate_ironman_chat_badge.png";
import hardcoreBadge from "./icons/Hardcore_ironman_chat_badge.png";
import groupBadge from "./icons/Group_ironman_chat_badge.png";
import hardcoreGroupBadge from "./icons/Hardcore_group_ironman_chat_badge.png";
import unrankedGroupBadge from "./icons/Unranked_group_ironman_chat_badge.png";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  normal: "Main",
  ironman: "Ironman",
  ultimate_ironman: "Ultimate Ironman",
  hardcore_ironman: "Hardcore Ironman",
  group_ironman: "Group Ironman",
  hardcore_group_ironman: "Hardcore Group Ironman",
  unranked_group_ironman: "Unranked Group Ironman",
  unknown: "Unranked",
};

// OSRS's own in-game chat badges (client/src/core/ui/icons), from
// RuneProfile — unlike WOM, it distinguishes group ironman variants. No
// icon at all for a main (normal) or unranked account.
const ACCOUNT_TYPE_BADGE: Partial<Record<AccountType, string>> = {
  ironman: ironmanBadge,
  ultimate_ironman: ultimateBadge,
  hardcore_ironman: hardcoreBadge,
  group_ironman: groupBadge,
  hardcore_group_ironman: hardcoreGroupBadge,
  unranked_group_ironman: unrankedGroupBadge,
};

export function AccountTypeIcon({ accountType }: { accountType: AccountType | null | undefined }) {
  const badge = accountType && ACCOUNT_TYPE_BADGE[accountType];
  if (!badge) return null;
  return <img src={badge} alt={ACCOUNT_TYPE_LABEL[accountType]} title={ACCOUNT_TYPE_LABEL[accountType]} className="inline-block align-[-2px]" />;
}

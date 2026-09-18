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

/**
 * The badges are 10x13 (13x13 for UIM) pixel art. `size` is the rendered
 * height in px; the default is native. Scaled copies use nearest-neighbour
 * so the pixels stay crisp instead of going blurry.
 */
export function AccountTypeIcon({ accountType, size, className = "" }: { accountType: AccountType | null | undefined; size?: number; className?: string }) {
  const badge = accountType && ACCOUNT_TYPE_BADGE[accountType];
  if (!badge) return null;
  const label = ACCOUNT_TYPE_LABEL[accountType];
  const style = size ? { height: size, width: "auto", imageRendering: "pixelated" as const } : undefined;
  return <img src={badge} alt={label} title={label} className={`inline-block align-[-2px] ${className}`} style={style} />;
}

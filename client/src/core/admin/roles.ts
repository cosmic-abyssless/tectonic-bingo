import type { Role } from "@bingo/shared";

/** Each role's name (CONTEXT.md "Roles & Identity"). */
export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  moderator: "Moderator",
  staff: "Staff",
  captain: "Captain",
  player: "Player",
};

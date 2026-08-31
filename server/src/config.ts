// Comma-separated Discord user IDs that bootstrap as site admins on login.
// This is only the bootstrap mechanism — once schema v2 lands (Phase 2),
// admins are also grantable from the admin UI via users.isAdmin.
export function getAdminDiscordIds(): string[] {
  return (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdminDiscordId(discordId: string): boolean {
  return getAdminDiscordIds().includes(discordId);
}

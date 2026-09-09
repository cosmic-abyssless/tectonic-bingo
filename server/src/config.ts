// Comma-separated Discord user IDs that bootstrap as site admins on login.
// Granted admins (users.isAdmin) get every site-admin power except granting
// site admin itself — that stays with the IDs listed here.
export function getAdminDiscordIds(): string[] {
  return (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdminDiscordId(discordId: string): boolean {
  return getAdminDiscordIds().includes(discordId);
}

import path from "path";

// Where uploaded screenshots and tile images live. Overridable so a Railway
// deploy can point this at a mounted volume (the default path lives inside the
// container's filesystem, which does not survive a redeploy). Both the multer
// destinations and the static `/uploads` route must use this same directory.
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(__dirname, "../uploads");

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

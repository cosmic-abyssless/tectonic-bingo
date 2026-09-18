import path from "path";

// Where uploaded screenshots and tile images live. Overridable so a Railway
// deploy can point this at a mounted volume (the default path lives inside the
// container's filesystem, which does not survive a redeploy). Both the multer
// destinations and the static `/uploads` route must use this same directory.
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(__dirname, "../uploads");

// Cached OSRS wiki item icons (middleware/wikiIcons.ts). Under the uploads dir so it
// lives on the same persistent volume, but it is a disposable cache: anything in
// here is re-fetched on demand.
export const WIKI_ICONS_DIR = path.join(UPLOADS_DIR, "wiki-icons");

// Sent on every outbound request to third-party APIs (Wise Old Man, RuneProfile,
// the OSRS wiki, tectonic-api). WOM's API rules ask for a way to contact the
// operator and will IP-ban anonymous abusers, so set USER_AGENT_CONTACT to a
// Discord handle or email for your deploy. Callers append their purpose.
export const USER_AGENT = `tectonic-bingo/1.0 (+${process.env.USER_AGENT_CONTACT || "https://github.com/cosmic-abyssless/tectonic-bingo"})`;

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

import { clearAuthCache } from "../../api/authCache";
import { clearBoardCache } from "../../api/boardCache";

/**
 * Dev mode only: log in as another account (POST /auth/dev-login) and reload the page you're on as them. For the
 * header's account switcher and the profile's "View as". Rejects if the server wouldn't (dev login off, no such user).
 */
export async function devLoginAs(who: { discordId: string } | { userId: string }): Promise<void> {
  const res = await fetch("/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(who),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // The cached board and identity are the old account's.
  clearBoardCache();
  clearAuthCache();
  window.location.reload();
}

/**
 * Dev mode only: switch your own admin powers off or back on (POST /auth/dev-admin), and reload the page you're on
 * without them or with them. For the header's account switcher.
 */
export async function devSetAdmin(enabled: boolean): Promise<void> {
  const res = await fetch("/auth/dev-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // The cached board and identity were loaded with the old powers.
  clearBoardCache();
  clearAuthCache();
  window.location.reload();
}

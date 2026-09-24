import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Autocomplete,
  Dialog,
  DialogTrigger,
  Input,
  ListLayout,
  Menu,
  MenuItem,
  Popover,
  SearchField,
  useFilter,
  Virtualizer,
} from "react-aria-components";
import type { User } from "@bingo/shared";
import { useAuth } from "../../context/AuthContext";
import { Button } from "./Button";
import { devLoginAs } from "./devLogin";
import { controlClass } from "./Field";
import { CheckIcon, SwapIcon } from "./icons";
import { avatarUrl, displayName } from "./user";

// Every row the same height, so the list can be virtualized: hundreds of accounts (every generated test bingo's
// players), and drawing them all took over half a second to open.
const ROW_HEIGHT = 48;

// The server's dev user list, asked about the page you're on (server: routes/auth.ts, services/devPageAccessService.ts).
type DevUser = User & { access?: boolean; role?: string | null };

/**
 * Dev mode only: the header's account switcher. A searchable list of every account (search by name, Discord name or
 * role: "captain", a team name…); picking one logs in as them and reloads the page you're on, rather than going
 * through the login page. Accounts that couldn't open this page are dimmed (still pickable, to see what they'd get).
 */
export function DevAccountSwitcher() {
  const { user, devMode } = useAuth();
  if (!devMode || !user) return null;
  return <Switcher currentUserId={user.id} />;
}

function Switcher({ currentUserId }: { currentUserId: string }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<DevUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const { contains } = useFilter({ sensitivity: "base" });

  // Asked afresh each time it opens: the page (and so who can open it) may have changed since.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    fetch(`/auth/dev-users?path=${encodeURIComponent(pathname)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { users: DevUser[] }) => !cancelled && setUsers(data.users))
      .catch(() => !cancelled && setError("Couldn't load the accounts."));
    return () => {
      cancelled = true;
    };
  }, [open, pathname]);

  // Who can open this page first, then whoever has a part in its bingo, then by name.
  const ordered = useMemo(
    () =>
      [...(users ?? [])].sort(
        (a, b) => Number(b.access !== false) - Number(a.access !== false) || Number(!!b.role) - Number(!!a.role) || displayName(a).localeCompare(displayName(b)),
      ),
    [users],
  );

  async function switchTo(discordId: string) {
    setSwitching(discordId);
    try {
      await devLoginAs({ discordId });
    } catch {
      setError("Couldn't switch to that account.");
      setSwitching(null);
    }
  }

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="sm" aria-label="Switch account (dev)" className="text-warn">
        <SwapIcon size={16} />
      </Button>
      <Popover placement="bottom end" offset={6} className="overlay-panel flex w-80 flex-col rounded-md border border-outline bg-surface-raised shadow-pop outline-none">
        <Dialog aria-label="Switch account" className="flex min-h-0 flex-col outline-none">
          <p className="px-3 pt-2.5 text-[11px] font-medium uppercase tracking-widest text-warn">Dev: switch account</p>
          <Autocomplete filter={contains}>
            <SearchField aria-label="Search accounts" autoFocus className="p-2">
              <Input placeholder="Name, Discord or role…" className={controlClass("sm")} />
            </SearchField>
            {error && <p className="px-3 pb-2 text-xs text-danger">{error}</p>}
            {!users && !error ? (
              <p className="px-3 pb-3 text-sm text-on-surface-muted">Loading…</p>
            ) : (
              <Virtualizer layout={ListLayout} layoutOptions={{ rowSize: ROW_HEIGHT, padding: 4 }}>
                <Menu
                  items={ordered}
                  aria-label="Accounts"
                  onAction={(key) => {
                    const picked = ordered.find((u) => u.id === key);
                    if (picked && picked.id !== currentUserId) void switchTo(picked.discordId);
                  }}
                  renderEmptyState={() => <p className="px-3 py-2 text-sm text-on-surface-subtle">No one matches.</p>}
                  className="max-h-96 min-h-0 overflow-y-auto outline-none"
                >
                  {(u) => (
                    <MenuItem
                      id={u.id}
                      textValue={`${displayName(u)} ${u.discordUsername} ${u.role ?? ""}`}
                      isDisabled={!!switching}
                      style={{ height: ROW_HEIGHT }}
                      className={`mx-1 flex cursor-default items-center gap-2.5 rounded-sm px-2 text-sm outline-none hover:bg-surface-hover focus:bg-surface-hover ${
                        u.access === false ? "opacity-40" : ""
                      }`}
                    >
                      <img src={avatarUrl(u)} alt="" className="size-6 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-on-surface">{displayName(u)}</span>
                        <span className="block truncate text-xs text-on-surface-subtle">
                          {switching === u.discordId ? "Switching…" : [u.role, u.access === false ? "can't open this page" : null].filter(Boolean).join(" · ") || u.discordUsername}
                        </span>
                      </span>
                      {u.id === currentUserId && <CheckIcon size={14} className="shrink-0 text-on-surface-muted" />}
                    </MenuItem>
                  )}
                </Menu>
              </Virtualizer>
            )}
          </Autocomplete>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

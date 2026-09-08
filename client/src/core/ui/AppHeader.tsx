import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Button } from "./Button";
import { Menu, MenuItem, MenuTrigger } from "./Menu";
import { ArrowLeftIcon } from "./icons";
import { avatarUrl, displayName } from "./user";

/**
 * Top bar shared by every page: optional back link, title/subtitle, page
 * actions, and the signed-in user's menu.
 */
export function AppHeader({ back, title, subtitle, children }: { back?: { to: string; label: string }; title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {back && (
            <Link to={back.to} aria-label={back.label} className="hit-40 relative flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">
              <ArrowLeftIcon />
            </Link>
          )}
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-fg">{title}</div>
            {subtitle && <div className="truncate text-xs text-fg-muted">{subtitle}</div>}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {children}
          {user && (
            <MenuTrigger>
              <Button variant="ghost" size="sm" aria-label="Account menu" className="pl-1.5">
                <img src={avatarUrl(user)} alt="" className="size-6 rounded-full" />
                <span className="hidden sm:inline">{displayName(user)}</span>
              </Button>
              <Menu onAction={(key) => key === "logout" && logout()}>
                {user.isAdmin && (
                  <MenuItem id="admin" href="/admin">
                    Site admin
                  </MenuItem>
                )}
                <MenuItem id="logout">Log out</MenuItem>
              </Menu>
            </MenuTrigger>
          )}
        </div>
      </div>
    </header>
  );
}

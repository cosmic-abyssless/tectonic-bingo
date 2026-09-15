import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useColorSchemePreference } from "./colorScheme";
import { BugReportDialog } from "./BugReportDialog";
import { Button, IconButton } from "./Button";
import { Menu, MenuItem, MenuTrigger } from "./Menu";
import { AlertIcon, ArrowLeftIcon, CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "./icons";
import { avatarUrl, displayName } from "./user";

const COLOR_SCHEME_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

/**
 * Top bar shared by every page: optional back link, title/subtitle, page
 * actions, and the signed-in user's menu. `menuItems` are extra `MenuItem`s
 * (with their own `onAction`) slotted above "Log out".
 */
export function AppHeader({
  back,
  title,
  subtitle,
  menuItems,
  children,
}: {
  back?: { to: string; label: string };
  title: ReactNode;
  subtitle?: ReactNode;
  menuItems?: ReactNode;
  children?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [colorScheme, setColorScheme] = useColorSchemePreference();
  return (
    <header className="sticky top-0 z-20 border-b-[length:var(--control-border-width,1px)] border-outline bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {back && (
            <Link to={back.to} aria-label={back.label} className="hit-40 relative flex size-8 items-center justify-center rounded-md text-on-surface-muted transition-colors hover:bg-surface-hover hover:text-on-surface">
              <ArrowLeftIcon />
            </Link>
          )}
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-on-surface">{title}</div>
            {subtitle && <div className="truncate text-xs text-on-surface-muted">{subtitle}</div>}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {children}
          {user && (
            <>
              <IconButton label="Report a bug" size="sm" onPress={() => setBugReportOpen(true)}>
                <AlertIcon />
              </IconButton>
              <BugReportDialog isOpen={bugReportOpen} onClose={() => setBugReportOpen(false)} />
            </>
          )}
          {user && (
            <MenuTrigger>
              <Button variant="ghost" size="sm" aria-label="Account menu" className="pl-1.5">
                <img src={avatarUrl(user)} alt="" className="size-6 rounded-full" />
                <span className="hidden sm:inline">{displayName(user)}</span>
              </Button>
              <Menu>
                {user.isAdmin && (
                  <MenuItem id="admin" href="/admin">
                    Site admin
                  </MenuItem>
                )}
                {menuItems}
                {COLOR_SCHEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <MenuItem key={value} id={`color-scheme-${value}`} className="justify-between" onAction={() => setColorScheme(value)}>
                    <span className="flex items-center gap-2">
                      <Icon size={14} />
                      {label}
                    </span>
                    {colorScheme === value && <CheckIcon size={14} />}
                  </MenuItem>
                ))}
                <MenuItem id="logout" onAction={logout}>
                  Log out
                </MenuItem>
              </Menu>
            </MenuTrigger>
          )}
        </div>
      </div>
    </header>
  );
}

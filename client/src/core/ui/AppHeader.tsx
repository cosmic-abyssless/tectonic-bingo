import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, useMatch } from "react-router-dom";
import { useBingo, useMyBugReports } from "../../api/queries";
import { useBugReports } from "../../api/adminQueries";
import { useAuth } from "../../context/AuthContext";
import { useColorSchemePreference } from "./colorScheme";
import { ADMIN_BUG_REPORTS_SEEN_KEY, useBugReportsUnseen } from "./bugReportsUnseen";
import { BugReportButton } from "./BugReportButton";
import { BugReportDialog } from "./BugReportDialog";
import { DevAccountSwitcher } from "./DevAccountSwitcher";
import { PhoneLoginDialog } from "./PhoneLoginDialog";
import { useIsPhone } from "./useMediaQuery";
import { Button } from "./Button";
import { PulseDot } from "./Card";
import { Menu, MenuItem, MenuTrigger } from "./Menu";
import { ArrowLeftIcon, CheckIcon, MonitorIcon, MoonIcon, PhoneIcon, SunIcon } from "./icons";
import { useOptionalSlot } from "../../themes/context";
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
  mobileMenu,
  children,
  className,
  titleClassName,
  style,
}: {
  back?: { to: string; label: string };
  title: ReactNode;
  subtitle?: ReactNode;
  menuItems?: ReactNode;
  /**
   * A collapsed-navigation control (a hamburger) for narrow screens. When
   * given, the header lays out as a phone bar: title and this menu, the bug
   * report and the account button on the top row (menu at the far right,
   * after the user icon), with `children` wrapping onto a row of their own below. Without
   * it the header is unchanged. The caller hides it at ≥md itself.
   */
  mobileMenu?: ReactNode;
  children?: ReactNode;
  /** Extra classes on the <header>; themes use these to re-skin the bar. */
  className?: string;
  titleClassName?: string;
  style?: CSSProperties;
}) {
  const { user, logout } = useAuth();
  // Inside a bingo the viewer is named by the RSN they signed up with (their team's roster carries it); anywhere
  // else, and for an account that isn't playing, by their Discord name.
  const bingoSlug = useMatch("/b/:slug/*")?.params.slug;
  const { data: shell } = useBingo(bingoSlug);
  const myRsn = user ? shell?.teams.flatMap((t) => t.members).find((m) => m.user.id === user.id)?.user.rsn : null;
  const [bugReportOpen, setBugReportOpen] = useState(false);
  // "Log in on your phone" (a QR code): offered on a computer, where it's the way onto the phone.
  const [phoneLoginOpen, setPhoneLoginOpen] = useState(false);
  const phone = useIsPhone();
  const [colorScheme, setColorScheme] = useColorSchemePreference();
  const compact = !!mobileMenu;
  // Fetched here (not gated on the dialog being open) so the pulse dot can show without opening it —
  // BugReportDialog's own useMyBugReports call shares this same cached query.
  const { data: myReports } = useMyBugReports(!!user?.inGuild);
  const { hasUnseen: hasUnseenBugReports, markSeen: markBugReportsSeen } = useBugReportsUnseen(myReports?.bugReports, `bugReports:lastSeen:mine:${user?.id ?? "anon"}`);
  // Site admins: a dot on their name (and on "Site admin" in its menu) when anyone has filed a report since they last
  // looked at the Bug reports tab, which shares this "last seen" and clears it. New reports only, not status changes:
  // an admin resolving one shouldn't light it up.
  const { data: allReports } = useBugReports(!!user?.isAdmin);
  // A theme can draw its own (the BugReportButton slot); pages outside a theme (mod panel, site admin) get core's.
  const BugButton = useOptionalSlot("BugReportButton") ?? BugReportButton;
  const { hasUnseen: hasNewReportsForAdmin } = useBugReportsUnseen(user?.isAdmin ? allReports?.bugReports : undefined, ADMIN_BUG_REPORTS_SEEN_KEY, { newOnly: true });

  // The bug-report button and the signed-in user's menu.
  const utility = (
    <>
      {/* Dev mode only (renders nothing otherwise). */}
      <DevAccountSwitcher />
      {user?.inGuild && (
        <>
          {/* Brings its own "Report a bug" tooltip: wrapped from out here, the tooltip's hover wiring reached the slot
              component, not the button inside it. */}
          <BugButton
            hasUnseen={hasUnseenBugReports}
            onPress={() => {
              setBugReportOpen(true);
              markBugReportsSeen();
            }}
          />
          <BugReportDialog isOpen={bugReportOpen} onClose={() => setBugReportOpen(false)} />
        </>
      )}
      {user && (
        <MenuTrigger>
          <Button variant="ghost" size="sm" aria-label={hasNewReportsForAdmin ? "Account menu (new bug reports)" : "Account menu"} className="relative pl-1.5">
            <img src={avatarUrl(user)} alt="" className="size-6 rounded-full" />
            {hasNewReportsForAdmin && <PulseDot className="left-5 top-0.5" />}
            <span className="hidden sm:inline">{myRsn || displayName(user)}</span>
          </Button>
          <Menu>
            {user.isAdmin && (
              <MenuItem id="admin" href="/admin">
                <span className="relative pr-3">
                  Site admin
                  {hasNewReportsForAdmin && <PulseDot className="right-0 top-0.5" />}
                </span>
              </MenuItem>
            )}
            {menuItems}
            {!phone && (
              <MenuItem id="phone-login" onAction={() => setPhoneLoginOpen(true)}>
                <span className="flex items-center gap-2">
                  <PhoneIcon size={14} />
                  Log in on your phone
                </span>
              </MenuItem>
            )}
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
      {user && <PhoneLoginDialog isOpen={phoneLoginOpen} onClose={() => setPhoneLoginOpen(false)} />}
    </>
  );

  return (
    <header className={`sticky top-0 z-20 border-b-[length:var(--control-border-width,1px)] border-outline bg-surface/90 backdrop-blur ${className ?? ""}`} style={style}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        {/* In the phone bar the title takes the row's slack (basis 0, so it
            never forces the utility group to wrap) and truncates if it must. */}
        <div className={`flex min-w-0 items-center gap-2 ${compact ? "flex-1 md:flex-none" : ""}`}>
          {back && (
            <Link to={back.to} aria-label={back.label} className="hit-40 relative flex size-8 items-center justify-center rounded-md text-on-surface-muted transition-colors hover:bg-surface-hover hover:text-on-surface">
              <ArrowLeftIcon />
            </Link>
          )}
          <div className="min-w-0 leading-tight">
            {/* Themeable via --font-heading/--font-heading-weight — both no-ops outside a themed page */}
            <div className={`truncate text-sm font-semibold text-on-surface ${titleClassName ?? ""}`} style={{ fontFamily: "var(--font-heading, inherit)", fontWeight: "var(--font-heading-weight, revert)" }}>
              {title}
            </div>
            {subtitle && <div className="truncate text-xs text-on-surface-muted">{subtitle}</div>}
          </div>
        </div>

        {compact ? (
          <>
            {/* Phone: page actions on a row of their own (order-3, full
                width); the menu, bug report and user sit top-right. From md
                up it's the usual single bar: actions, then the utilities. */}
            <div className="order-3 flex basis-full flex-wrap items-center gap-2 md:order-2 md:ml-auto md:basis-auto">{children}</div>
            <div className="order-2 flex items-center gap-2 md:order-3">
              {utility}
              {mobileMenu}
            </div>
          </>
        ) : (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {children}
            {utility}
          </div>
        )}
      </div>
    </header>
  );
}

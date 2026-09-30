import { useContext, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useMatch, useNavigate } from "react-router-dom";
import { useBingo, useMyBugReports } from "../../api/queries";
import { useBugReports } from "../../api/adminQueries";
import { useAuth } from "../../context/AuthContext";
import { useColorSchemePreference } from "./colorScheme";
import { ADMIN_BUG_REPORTS_SEEN_KEY, useBugReportsUnseen } from "./bugReportsUnseen";
import { BugReportButton } from "./BugReportButton";
import { BugReportDialog } from "./BugReportDialog";
import { DevAccountSwitcher } from "./DevAccountSwitcher";
import { PhoneLoginDialog } from "./PhoneLoginDialog";
import { ConnectedAppsDialog } from "./ConnectedAppsDialog";
import { useIsPhone } from "./useMediaQuery";
import { PulseDot } from "./Card";
import { NavMenuControlContext, PlainHeaderMenu, type HeaderMenuEntry, type HeaderMenuGroup } from "./headerMenu";
import { ArrowLeftIcon } from "./icons";
import { useOptionalSlot } from "../../themes/context";
import { useOpenProfile } from "../tectonic/PlayerName";
import { avatarUrl, displayName } from "./user";

/**
 * Top bar shared by every page: the ☰ menu and the title/subtitle at the left, then at the right the page's controls,
 * the dev account switcher, the page's actions (`children`: Mod panel, Submit), the bug report button and the account
 * menu (the viewer's avatar and name). The ☰ holds the navigation: the page's own entries (`menuEntries`, a bingo
 * page's "This Bingo" group) and the site's pages. The account menu holds the colour scheme, the viewer's Profile
 * (inside a bingo), Connected apps (admins), Log in on your phone and Log out.
 */
export function AppHeader({
  back,
  title,
  subtitle,
  titleAside,
  menuEntries,
  controls,
  children,
  className,
  titleClassName,
  style,
}: {
  /** A way back for a page whose ☰ would be empty (a legal page, for someone signed out or not an admin). */
  back?: { to: string; label: string };
  title: ReactNode;
  subtitle?: ReactNode;
  /** Beside the title (the board's Codeword banner); on a phone, a row of its own under the bar. */
  titleAside?: ReactNode;
  /** The page's own ☰ entries, each only where it applies (see headless useBingoMenuEntries for a bingo page's). */
  menuEntries?: HeaderMenuEntry[];
  /** What the page shows up here that isn't an action (the default theme's team picker), before the actions. */
  controls?: ReactNode;
  /** The page's actions: Mod panel, then Submit. */
  children?: ReactNode;
  /** Extra classes on the <header>; themes use these to re-skin the bar. */
  className?: string;
  titleClassName?: string;
  style?: CSSProperties;
}) {
  const { user, devMode, logout } = useAuth();
  const navigate = useNavigate();
  // Inside a bingo the viewer is named by the RSN they signed up with (their team's roster carries it); anywhere
  // else, and for an account that isn't playing, by their Discord name.
  const bingoSlug = useMatch("/b/:slug/*")?.params.slug;
  const { data: shell } = useBingo(bingoSlug);
  const myRsn = user ? shell?.teams.flatMap((t) => t.members).find((m) => m.user.id === user.id)?.user.rsn : null;
  const onBingoList = !!useMatch("/");
  const onSiteAdmin = !!useMatch("/admin");
  const [bugReportOpen, setBugReportOpen] = useState(false);
  // "Log in on your phone" (a QR code): offered on a computer, where it's the way onto the phone.
  const [phoneLoginOpen, setPhoneLoginOpen] = useState(false);
  // Admins: the Claude apps they've connected to the admin MCP server (#293).
  const [connectedAppsOpen, setConnectedAppsOpen] = useState(false);
  const phone = useIsPhone();
  const [colorScheme, setColorScheme] = useColorSchemePreference();
  // The viewer's own player profile, on the pages of a bingo that can show one (under PlayerProfileProvider).
  const openProfile = useOpenProfile();
  // Fetched here (not gated on the dialog being open) so the pulse dot can show without opening it —
  // BugReportDialog's own useMyBugReports call shares this same cached query.
  const { data: myReports } = useMyBugReports(!!user?.inGuild);
  const { hasUnseen: hasUnseenBugReports, markSeen: markBugReportsSeen } = useBugReportsUnseen(myReports?.bugReports, `bugReports:lastSeen:mine:${user?.id ?? "anon"}`);
  // Site admins: a dot on ☰ (and on "Site admin" in it) when anyone has filed a report since they last looked at the
  // Bug reports tab, which shares this "last seen" and clears it. New reports only, not status changes: an admin
  // resolving one shouldn't light it up.
  const { data: allReports } = useBugReports(!!user?.isAdmin);
  // A theme can draw its own (the BugReportButton and HeaderMenu slots); pages outside a theme (mod panel, site admin)
  // get core's.
  const BugButton = useOptionalSlot("BugReportButton") ?? BugReportButton;
  const HeaderMenu = useOptionalSlot("HeaderMenu") ?? PlainHeaderMenu;
  // A Bingo page holds the ☰'s open state (its Tutorial opens and closes it with the Player); elsewhere it's the menu's own.
  const navMenuControl = useContext(NavMenuControlContext);
  const { hasUnseen: hasNewReportsForAdmin } = useBugReportsUnseen(user?.isAdmin ? allReports?.bugReports : undefined, ADMIN_BUG_REPORTS_SEEN_KEY, { newOnly: true });

  // The ☰, at the left: getting around.
  const navGroups: HeaderMenuGroup[] = [
    { id: "bingo", label: "This Bingo", items: menuEntries ?? [] },
    {
      id: "site",
      label: "Site",
      items: [
        // The same people who get the board's All bingos arrow: "/" bounces everyone else to the latest bingo.
        ...(user?.isAdmin || devMode ? [{ id: "all-bingos", text: "All bingos", label: "All bingos", wikiIcon: "Grid Master icon", current: onBingoList, onAction: () => navigate("/") }] : []),
        ...(user?.isAdmin
          ? [
              {
                id: "site-admin",
                text: "Site admin",
                wikiIcon: "Settings",
                label: (
                  <span className="relative pr-3">
                    Site admin
                    {hasNewReportsForAdmin && <PulseDot className="right-0 top-0.5" />}
                  </span>
                ),
                current: onSiteAdmin,
                onAction: () => navigate("/admin"),
              },
            ]
          : []),
      ],
    },
  ].filter((group) => group.items.length > 0);
  // The viewer's account, behind their avatar and name at the right.
  const accountGroups: HeaderMenuGroup[] = [
    {
      id: "account",
      label: "Account",
      items: [
        { kind: "colorScheme", id: "color-scheme", value: colorScheme, onChange: setColorScheme },
        ...(user && openProfile ? [{ id: "profile", text: "Profile", label: "Profile", wikiIcon: "Worn Equipment", onAction: () => openProfile(user.id) }] : []),
        ...(user?.isAdmin ? [{ id: "connected-apps", text: "Connected apps", label: "Connected apps", wikiIcon: "Account Management - Links icon", onAction: () => setConnectedAppsOpen(true) }] : []),
        ...(!phone
          ? [
              {
                id: "phone-login",
                text: "Log in on your phone",
                label: "Log in on your phone",
                wikiIcon: "Mobile minimenu icon",
                onAction: () => setPhoneLoginOpen(true),
              },
            ]
          : []),
        { id: "logout", text: "Log out", label: "Log out", wikiIcon: "Logout", onAction: logout },
      ],
    },
  ];
  const hasNav = !!user && navGroups.length > 0;

  return (
    <header className={`sticky top-0 z-20 border-b-[length:var(--control-border-width,1px)] border-outline bg-surface/90 backdrop-blur ${className ?? ""}`} style={style}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        {/* The title takes the row's slack and truncates, down to a floor; past that the actions wrap onto a row of
            their own rather than squeezing the title to nothing. */}
        <div className="flex min-w-32 flex-1 basis-0 items-center gap-2">
          {hasNav ? (
            <HeaderMenu trigger={{ kind: "nav", hasUnseen: hasNewReportsForAdmin }} groups={navGroups} isOpen={navMenuControl?.isOpen} onOpenChange={navMenuControl?.onOpenChange} />
          ) : (
            back && (
            <Link to={back.to} aria-label={back.label} className="hit-40 relative flex size-8 shrink-0 items-center justify-center rounded-md text-on-surface-muted transition-colors hover:bg-surface-hover hover:text-on-surface">
              <ArrowLeftIcon />
            </Link>
            )
          )}
          <div className="min-w-0 leading-tight">
            {/* Themeable via --font-heading/--font-heading-weight — both no-ops outside a themed page */}
            <div className={`truncate text-sm font-semibold text-on-surface ${titleClassName ?? ""}`} style={{ fontFamily: "var(--font-heading, inherit)", fontWeight: "var(--font-heading-weight, revert)" }}>
              {title}
            </div>
            {subtitle && <div className="truncate text-xs text-on-surface-muted">{subtitle}</div>}
          </div>
          {/* Right of the title from md up; on a phone there's no room beside it, so it gets a row of its own below. */}
          {titleAside && <div className="ml-2 flex shrink-0 items-center max-md:hidden">{titleAside}</div>}
        </div>

        {titleAside && <div className="flex min-w-0 basis-full items-center md:hidden max-md:order-last">{titleAside}</div>}

        {/* On a phone the page's controls take a row of their own under the bar, so the actions stay beside the title. */}
        {controls && <div className="flex items-center gap-2 max-md:order-last max-md:basis-full">{controls}</div>}

        <div className="ml-auto flex items-center gap-2">
          {/* Dev mode only (renders nothing otherwise). */}
          <DevAccountSwitcher />
          {children}
          {user?.inGuild && (
            <>
              {/* Brings its own "Report a bug" tooltip: wrapped from out here, the tooltip's hover wiring reached the
                  slot component, not the button inside it. */}
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
          {user && <HeaderMenu trigger={{ kind: "account", name: myRsn || displayName(user), avatarUrl: avatarUrl(user) }} groups={accountGroups} />}
        </div>
        {user && <PhoneLoginDialog isOpen={phoneLoginOpen} onClose={() => setPhoneLoginOpen(false)} />}
        {user?.isAdmin && <ConnectedAppsDialog isOpen={connectedAppsOpen} onClose={() => setConnectedAppsOpen(false)} />}
      </div>
    </header>
  );
}

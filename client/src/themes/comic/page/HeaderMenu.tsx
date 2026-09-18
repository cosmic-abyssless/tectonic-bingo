import type { ReactNode } from "react";
import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover } from "react-aria-components";
import { MenuIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicIconButton } from "../ui/ComicButton";
import { useThemeVarsInPortal } from "../ui/ComicDialog";
import { useComic } from "../ui/useComic";

export interface HeaderMenuEntry {
  id: string;
  label: ReactNode;
  /** Plain text for typeahead / screen readers. */
  text: string;
  /** Navigation goes through the router's navigate (react-aria's `href` would reload the page). */
  onAction: () => void;
  /** Rendered after the label (e.g. a pending count). */
  badge?: ReactNode;
}

/**
 * The masthead's navigation and secondary actions collapsed behind a
 * hamburger, for narrow screens (PageHeader hides the inline buttons
 * below `md` and shows this instead). The popover portals to body, so the
 * theme vars are re-applied on it — same treatment as TeamSelector.
 */
export function HeaderMenu({ entries }: { entries: HeaderMenuEntry[] }) {
  const { colors } = useComic();
  const portalVars = useThemeVarsInPortal();
  if (entries.length === 0) return null;

  return (
    <MenuTrigger>
      <ComicIconButton label="Menu" className="size-9">
        <MenuIcon />
      </ComicIconButton>
      <Popover
        placement="bottom end"
        offset={8}
        style={{ ...portalVars, background: colors.PAPER_RAISED, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.LINE}` }}
        className="comic-panel-pop z-[60] min-w-48 overflow-hidden rounded-md border-[3px] outline-none"
      >
        <AriaMenu className="divide-y-2 outline-none" style={{ borderColor: colors.RULE }}>
          {entries.map((entry) => (
            <AriaMenuItem
              key={entry.id}
              id={entry.id}
              textValue={entry.text}
              onAction={entry.onAction}
              className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-lg uppercase outline-none focus:bg-[var(--comic-yellow)] hovered:bg-[var(--comic-yellow)] focus:text-[var(--comic-on-yellow)] hovered:text-[var(--comic-on-yellow)]"
              style={{ color: colors.INK, borderColor: colors.RULE, fontFamily: COMIC_FONT, letterSpacing: "0.04em" }}
            >
              {entry.label}
              {entry.badge}
            </AriaMenuItem>
          ))}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}

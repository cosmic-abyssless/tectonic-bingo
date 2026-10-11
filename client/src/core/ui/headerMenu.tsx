import { createContext, Fragment, type ReactNode } from "react";
import { MenuSection, Separator } from "react-aria-components";
import { Button, IconButton } from "./Button";
import { PulseDot } from "./Card";
import { Menu, MenuItem, MenuTrigger } from "./Menu";
import { CheckIcon, MenuIcon } from "./icons";
import { WikiIcon } from "./ItemIcon";

// The header's two menus (AppHeader): the ☰ at the left, for getting around, and the viewer's avatar and name at the
// right, for their account. What goes in them, and core's own drawing of them; a theme draws its own through the
// HeaderMenu slot.

export interface HeaderMenuEntry {
  id: string;
  label: ReactNode;
  /** Plain text for typeahead / screen readers. */
  text: string;
  /** Navigation goes through the router's navigate (react-aria's `href` would reload the page). */
  onAction: () => void;
  /** An OSRS wiki icon's name ("Inventory"), drawn before the label. */
  wikiIcon?: string;
  /** Rendered after the label (e.g. a pending count). */
  badge?: ReactNode;
  /** The page you're on: drawn with a check mark, and not clickable. */
  current?: boolean;
  /** Marks the row for the Tutorial to point at (its data-tutorial attribute). */
  tutorial?: string;
}

/** One group of a menu (This Bingo, Site; Account), with a divider between each. */
export interface HeaderMenuGroup {
  id: string;
  /** Names the group for screen readers; not shown. */
  label: string;
  items: HeaderMenuEntry[];
}

/**
 * What opens the menu: the ☰ (the navigation, at the header's left; hasUnseen puts a dot on it when a Site admin has
 * bug reports they haven't seen), or the viewer's avatar and name (their account, at the right; named the way the
 * page names them).
 */
export type HeaderMenuTrigger = { kind: "nav"; hasUnseen: boolean } | { kind: "account"; name: string; avatarUrl: string };

export interface HeaderMenuProps {
  trigger: HeaderMenuTrigger;
  /** In order, never empty. */
  groups: HeaderMenuGroup[];
  /** Open state, when something outside controls it (the ☰, on a Bingo page: see NavMenuControlContext). */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * The ☰'s open state, held by a Bingo page (the Tutorial waits for the Player to open it, then closes it). AppHeader
 * hands it to the HeaderMenu slot; without it the menu keeps its own. The ☰'s button carries data-tutorial="menu".
 */
export const NavMenuControlContext = createContext<{ isOpen: boolean; onOpenChange: (isOpen: boolean) => void } | null>(null);

/** The account menu's button, the same in every theme: the viewer's avatar, and their name from `sm` up. */
export function AccountMenuButton({ name, avatarUrl }: { name: string; avatarUrl: string }) {
  return (
    <Button variant="ghost" size="sm" aria-label="Account menu" className="pl-1.5">
      <img src={avatarUrl} alt="" className="size-6 rounded-full" />
      <span className="hidden sm:inline">{name}</span>
    </Button>
  );
}

/** Core's header menus, in the core Menu: the default theme's, and the ones on pages outside any theme (mod panel, site admin). */
export function PlainHeaderMenu({ trigger, groups, isOpen, onOpenChange }: HeaderMenuProps) {
  return (
    <MenuTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger.kind === "nav" ? (
        <IconButton label={trigger.hasUnseen ? "Menu (new bug reports)" : "Menu"} size="sm" className="relative shrink-0" data-tutorial="menu">
          <MenuIcon />
          {trigger.hasUnseen && <PulseDot className="-right-0.5 -top-0.5" />}
        </IconButton>
      ) : (
        <AccountMenuButton name={trigger.name} avatarUrl={trigger.avatarUrl} />
      )}
      <Menu popoverClassName="min-w-56" placement={trigger.kind === "nav" ? "bottom start" : "bottom end"}>
        {groups.map((group, i) => (
          <Fragment key={group.id}>
            {i > 0 && <Separator className="my-1 h-px border-none bg-outline" />}
            <MenuSection aria-label={group.label}>
              {group.items.map((item) => (
                // The current page isn't disabled-looking: it's where you are, not something you can't do.
                <MenuItem key={item.id} id={item.id} textValue={item.text} isDisabled={item.current} onAction={item.onAction} className="disabled:opacity-100!" data-tutorial={item.tutorial}>
                  {item.wikiIcon && <WikiIcon name={item.wikiIcon} />}
                  {item.label}
                  {item.badge}
                  {item.current && <CheckIcon className="ml-auto" />}
                </MenuItem>
              ))}
            </MenuSection>
          </Fragment>
        ))}
      </Menu>
    </MenuTrigger>
  );
}

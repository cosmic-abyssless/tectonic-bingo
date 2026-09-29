import { Fragment, useRef, type FocusEvent, type ReactNode, type RefObject } from "react";
import { Header, MenuSection, RadioButton, RadioField, RadioGroup, Separator } from "react-aria-components";
import { IconButton } from "./Button";
import { PulseDot } from "./Card";
import { Menu, MenuItem, MenuTrigger } from "./Menu";
import { CheckIcon, MenuIcon, MonitorIcon, MoonIcon, SunIcon } from "./icons";

// The header's ☰ menu (AppHeader): what goes in it, and core's own drawing of it. A theme draws its own through the
// HeaderMenu slot.

export interface HeaderMenuEntry {
  id: string;
  label: ReactNode;
  /** Plain text for typeahead / screen readers. */
  text: string;
  /** Navigation goes through the router's navigate (react-aria's `href` would reload the page). */
  onAction: () => void;
  /** Rendered after the label (e.g. a pending count). */
  badge?: ReactNode;
  /** The page you're on: drawn with a check mark, and not clickable. */
  current?: boolean;
}

export type ColorSchemeChoice = "light" | "dark" | "system";

/** The Light/Dark/System row, one control in a row of its own; each menu draws it with ColorSchemeRadios. */
export interface HeaderMenuColorScheme {
  kind: "colorScheme";
  id: string;
  value: ColorSchemeChoice;
  onChange: (value: ColorSchemeChoice) => void;
}

export type HeaderMenuItem = HeaderMenuEntry | HeaderMenuColorScheme;

export function isColorSchemeItem(item: HeaderMenuItem): item is HeaderMenuColorScheme {
  return "kind" in item && item.kind === "colorScheme";
}

/** One group of the menu (This Bingo, Site, Account), drawn after the viewer's row with a divider before each. */
export interface HeaderMenuGroup {
  id: string;
  /** Names the group for screen readers; not shown. */
  label: string;
  items: HeaderMenuItem[];
}

export interface HeaderMenuProps {
  /** The non-interactive row at the top: who's signed in, named the way the page names them. */
  viewer: { name: string; avatarUrl: string };
  /** In order, never empty. */
  groups: HeaderMenuGroup[];
  /** A dot on the ☰ button: a Site admin has bug reports they haven't seen. */
  hasUnseen: boolean;
}

const COLOR_SCHEME_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

/**
 * The Light/Dark/System choice as one inline segmented control (rather than three separate menu rows), for a menu to
 * wrap in a single MenuItem (with shouldCloseOnSelect={false}) so it reads as one row. It's a horizontal RadioGroup so
 * its own Left/Right navigation doesn't fight the enclosing Menu's Up/Down navigation. Pass the row the onFocus from
 * useColorSchemeRowFocus, with the same groupRef here.
 */
export function ColorSchemeRadios({
  groupRef,
  value,
  onChange,
  className = "rounded-md border border-outline bg-surface",
  segmentClassName = "rounded-sm text-on-surface-muted selected:bg-accent selected:text-on-accent",
}: {
  groupRef: RefObject<HTMLDivElement | null>;
  value: ColorSchemeChoice;
  onChange: (value: ColorSchemeChoice) => void;
  className?: string;
  segmentClassName?: string;
}) {
  return (
    <RadioGroup ref={groupRef} aria-label="Color scheme" orientation="horizontal" value={value} onChange={(v) => onChange(v as ColorSchemeChoice)} className={`flex w-full gap-0.5 p-0.5 ${className}`}>
      {COLOR_SCHEME_OPTIONS.map(({ value: optionValue, label, icon: Icon }) => (
        <RadioField key={optionValue} value={optionValue} aria-label={label} className="flex-1">
          <RadioButton className={`flex cursor-default items-center justify-center py-1 outline-none transition-opacity hovered:opacity-70 focus-visible:ring-2 focus-visible:ring-accent ${segmentClassName}`}>
            <Icon size={14} />
          </RadioButton>
        </RadioField>
      ))}
    </RadioGroup>
  );
}

/**
 * The Menu's own item navigation only ever focuses the colour-scheme row's outer element (its roving tabindex has no
 * notion of what's inside), so arriving there by ArrowUp/ArrowDown hands real keyboard focus straight to the selected
 * segment — otherwise Left/Right would land on a plain div with nothing to move between. A click already focuses a
 * segment directly and never triggers this.
 */
export function useColorSchemeRowFocus() {
  const groupRef = useRef<HTMLDivElement>(null);
  const onFocus = (e: FocusEvent) => {
    if (e.target !== e.currentTarget) return;
    groupRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
  };
  return { groupRef, onFocus };
}

function PlainColorSchemeRow({ item }: { item: HeaderMenuColorScheme }) {
  const { groupRef, onFocus } = useColorSchemeRowFocus();
  return (
    <MenuItem id={item.id} textValue="Color scheme" shouldCloseOnSelect={false} onFocus={onFocus}>
      <ColorSchemeRadios groupRef={groupRef} value={item.value} onChange={item.onChange} />
    </MenuItem>
  );
}

/** Core's ☰ menu, in the core Menu: the default theme's, and the one on pages outside any theme (mod panel, site admin). */
export function PlainHeaderMenu({ viewer, groups, hasUnseen }: HeaderMenuProps) {
  return (
    <MenuTrigger>
      <IconButton label={hasUnseen ? "Menu (new bug reports)" : "Menu"} size="sm" className="relative">
        <MenuIcon />
        {hasUnseen && <PulseDot className="-right-0.5 -top-0.5" />}
      </IconButton>
      <Menu popoverClassName="min-w-56">
        {/* The viewer's row isn't clickable, so it's a band of its own at the top rather than another row. */}
        <MenuSection aria-label="You">
          <Header className="-mx-1 -mt-1 flex items-center gap-2 rounded-t-md bg-background px-3.5 py-2.5 text-sm font-semibold text-on-surface">
            <img src={viewer.avatarUrl} alt="" className="size-6 rounded-full" />
            <span className="truncate">{viewer.name}</span>
          </Header>
        </MenuSection>
        {groups.map((group, i) => (
          <Fragment key={group.id}>
            <Separator className={`${i === 0 ? "-mx-1 mb-1" : "my-1"} h-px border-none bg-outline`} />
            <MenuSection aria-label={group.label}>
              {group.items.map((item) =>
                isColorSchemeItem(item) ? (
                  <PlainColorSchemeRow key={item.id} item={item} />
                ) : (
                  // The current page isn't disabled-looking: it's where you are, not something you can't do.
                  <MenuItem key={item.id} id={item.id} textValue={item.text} isDisabled={item.current} onAction={item.onAction} className="disabled:opacity-100!">
                    {item.label}
                    {item.badge}
                    {item.current && <CheckIcon className="ml-auto" />}
                  </MenuItem>
                ),
              )}
            </MenuSection>
          </Fragment>
        ))}
      </Menu>
    </MenuTrigger>
  );
}

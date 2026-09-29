import { Fragment } from "react";
import { Header, Menu as AriaMenu, MenuItem as AriaMenuItem, MenuSection, MenuTrigger, Popover, Separator } from "react-aria-components";
import { PulseDot } from "../../../core/ui/Card";
import { ColorSchemeRadios, isColorSchemeItem, useColorSchemeRowFocus, type HeaderMenuColorScheme, type HeaderMenuProps } from "../../../core/ui/headerMenu";
import { CheckIcon, MenuIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicIconButton } from "../ui/ComicButton";
import { useThemeVarsInPortal } from "../ui/ComicDialog";
import { useComic } from "../ui/useComic";

const ROW = "flex items-center gap-2 px-3 py-2.5 text-lg uppercase outline-none";

/**
 * The comic theme's ☰ menu (the HeaderMenu slot), at the masthead's far right: Bangers rows ruled off from each other,
 * the highlighted one yellow, and a heavy ink line between the groups. The popover portals to body, so the theme vars
 * are re-applied on it — same treatment as TeamSelector.
 */
export function HeaderMenu({ viewer, groups, hasUnseen }: HeaderMenuProps) {
  const { colors } = useComic();
  const portalVars = useThemeVarsInPortal();

  return (
    <MenuTrigger>
      <ComicIconButton label={hasUnseen ? "Menu (new bug reports)" : "Menu"} className="relative size-9">
        <MenuIcon />
        {hasUnseen && <PulseDot className="-right-1 -top-1" />}
      </ComicIconButton>
      <Popover
        placement="bottom end"
        offset={8}
        style={{ ...portalVars, background: colors.PAPER_RAISED, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.SHADOW}` }}
        className="comic-panel-pop z-[60] flex min-w-56 flex-col overflow-hidden rounded-md border-[3px] outline-none"
      >
        {/* min-h-0: a menu taller than the room the popover gets scrolls instead of spilling out (see PlainMenu). */}
        <AriaMenu className="min-h-0 overflow-y-auto outline-none">
          <MenuSection aria-label="You">
            <Header className={`${ROW} normal-case`} style={{ color: colors.INK, fontFamily: COMIC_FONT, letterSpacing: "0.04em" }}>
              <img src={viewer.avatarUrl} alt="" className="size-7 rounded-full border-2" style={{ borderColor: colors.LINE }} />
              <span className="truncate">{viewer.name}</span>
            </Header>
          </MenuSection>
          {groups.map((group) => (
            <Fragment key={group.id}>
              <Separator className="h-[3px] border-none" style={{ background: colors.LINE }} />
              <MenuSection aria-label={group.label} className="divide-y-2" style={{ borderColor: colors.RULE }}>
                {group.items.map((item) =>
                  isColorSchemeItem(item) ? (
                    <ColorSchemeRow key={item.id} item={item} />
                  ) : (
                    <AriaMenuItem
                      key={item.id}
                      id={item.id}
                      textValue={item.text}
                      isDisabled={item.current}
                      onAction={item.onAction}
                      className={`${ROW} cursor-pointer disabled:cursor-default focus:bg-[var(--comic-yellow)] hovered:bg-[var(--comic-yellow)] focus:text-[var(--comic-on-yellow)] hovered:text-[var(--comic-on-yellow)]`}
                      style={{ color: colors.INK, borderColor: colors.RULE, fontFamily: COMIC_FONT, letterSpacing: "0.04em" }}
                    >
                      {item.label}
                      {item.badge}
                      {item.current && <CheckIcon className="ml-auto" />}
                    </AriaMenuItem>
                  ),
                )}
              </MenuSection>
            </Fragment>
          ))}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}

/** Light/Dark/System as ink-bordered segments, the chosen one yellow like a highlighted row. */
function ColorSchemeRow({ item }: { item: HeaderMenuColorScheme }) {
  const { colors } = useComic();
  const { groupRef, onFocus } = useColorSchemeRowFocus();
  return (
    <AriaMenuItem id={item.id} textValue="Color scheme" shouldCloseOnSelect={false} onFocus={onFocus} className="px-3 py-2.5 outline-none" style={{ borderColor: colors.RULE }}>
      <ColorSchemeRadios
        groupRef={groupRef}
        value={item.value}
        onChange={item.onChange}
        className="rounded-md border-2 border-[var(--comic-line)]"
        segmentClassName="rounded-sm text-[var(--comic-ink)] selected:bg-[var(--comic-yellow)] selected:text-[var(--comic-on-yellow)]"
      />
    </AriaMenuItem>
  );
}

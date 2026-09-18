import type { RefObject } from "react";
import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover } from "react-aria-components";
import type { TeamModel, TeamSelectorModel } from "../../../headless/types";
import { ChevronDownIcon, UsersIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useThemeVarsInPortal } from "../ui/ComicDialog";
import { useComic } from "../ui/useComic";

/** Team color as a small ink-edged square — the comic take on the dot. */
export function Swatch({ color, size = 12 }: { color: string | null | undefined; size?: number }) {
  const { colors } = useComic();
  return <span className="shrink-0 border-2" style={{ width: size, height: size, background: color ?? colors.PAPER_ALT, borderColor: colors.LINE }} aria-hidden />;
}

/**
 * The team list itself: a paper popover with a yellow highlight bar. Lives
 * inside a MenuTrigger; `triggerRef` anchors it to something other than the
 * trigger button (the team banner anchors it under the whole strip). The
 * popover portals to body, so the theme vars are re-applied on it.
 */
export function TeamMenu({ selector, triggerRef }: { selector: TeamSelectorModel; triggerRef?: RefObject<Element | null> }) {
  const { colors } = useComic();
  const portalVars = useThemeVarsInPortal();
  const selected = selector.teams.find((t) => t.id === selector.selectedId) ?? null;

  return (
    <Popover
      placement="bottom end"
      offset={8}
      triggerRef={triggerRef}
      style={{ ...portalVars, background: colors.PAPER_RAISED, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.LINE}` }}
      className="comic-panel-pop z-[60] min-w-52 overflow-hidden rounded-md border-[3px] outline-none"
    >
      <AriaMenu
        onAction={(key) => selector.select(String(key))}
        className="divide-y-2 outline-none"
        style={{ borderColor: colors.RULE }}
      >
        {selector.teams.map((team) => (
          <AriaMenuItem
            key={team.id}
            id={team.id}
            textValue={team.name}
            className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none focus:bg-[var(--comic-yellow)] hovered:bg-[var(--comic-yellow)] focus:text-[var(--comic-on-yellow)] hovered:text-[var(--comic-on-yellow)]"
            style={{ color: colors.INK, borderColor: colors.RULE }}
          >
            <Swatch color={team.color} />
            <span className="truncate font-medium">{team.name}</span>
            {team.id === selected?.id ? (
              <span className="ml-auto text-base leading-none" style={{ fontFamily: COMIC_FONT }}>
                Viewing
              </span>
            ) : team.isMine ? (
              <span className="ml-auto text-base leading-none opacity-60" style={{ fontFamily: COMIC_FONT }}>
                You
              </span>
            ) : null}
          </AriaMenuItem>
        ))}
      </AriaMenu>
    </Popover>
  );
}

/**
 * Mod-side team picker as a standalone button: a ComicButton trigger with
 * the selected team's swatch, opening the team menu. (The board now uses the
 * split TeamBanner instead; this stays as the theme's TeamSelector slot.)
 */
export function TeamSelector({ selector }: { selector: TeamSelectorModel }) {
  const selected = selector.teams.find((t) => t.id === selector.selectedId) ?? null;

  return (
    <MenuTrigger>
      <ComicButton size="sm" className="max-w-[16rem]">
        <Swatch color={selected?.color} />
        <span className="truncate">{selected?.name ?? "Select team"}</span>
        <ChevronDownIcon />
      </ComicButton>
      <TeamMenu selector={selector} />
    </MenuTrigger>
  );
}

/** The player's own team as a standalone button; opens the roster dialog. (Slot fallback — the board uses the TeamBanner.) */
export function TeamBadge({ team, onPress }: { team: TeamModel; onPress: () => void }) {
  return (
    <ComicButton size="sm" onPress={onPress} className="max-w-[16rem]">
      <Swatch color={team.color} />
      <span className="truncate">{team.name}</span>
      <UsersIcon />
    </ComicButton>
  );
}

import { Menu as AriaMenu, MenuItem as AriaMenuItem, MenuTrigger, Popover } from "react-aria-components";
import type { TeamModel, TeamSelectorModel } from "../../../headless/types";
import { ChevronDownIcon, UsersIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useThemeVarsInPortal } from "../ui/ComicDialog";
import { useComic } from "../ui/useComic";

/** Team color as a small ink-edged square — the comic take on the dot. */
function Swatch({ color, size = 12 }: { color: string | null | undefined; size?: number }) {
  const { colors } = useComic();
  return <span className="shrink-0 border-2" style={{ width: size, height: size, background: color ?? colors.PAPER_ALT, borderColor: colors.INK }} aria-hidden />;
}

/**
 * Mod-side team picker in the masthead: a ComicButton trigger with the
 * selected team's swatch, opening a paper menu with a yellow highlight bar.
 * The popover portals to body, so the theme vars are re-applied on it.
 */
export function TeamSelector({ selector }: { selector: TeamSelectorModel }) {
  const { colors } = useComic();
  const portalVars = useThemeVarsInPortal();
  const selected = selector.teams.find((t) => t.id === selector.selectedId) ?? null;

  return (
    <MenuTrigger>
      <ComicButton size="sm" className="max-w-[16rem]">
        <Swatch color={selected?.color} />
        <span className="truncate">{selected?.name ?? "Select team"}</span>
        <ChevronDownIcon />
      </ComicButton>
      <Popover
        placement="bottom end"
        offset={8}
        style={{ ...portalVars, background: colors.PAPER_RAISED, borderColor: colors.INK, boxShadow: `4px 4px 0 ${colors.INK}` }}
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
              className="flex cursor-default items-center gap-2 px-3 py-2 text-sm outline-none focus:bg-[var(--comic-yellow)] hovered:bg-[var(--comic-yellow)] focus:text-[#0b0b0d] hovered:text-[#0b0b0d]"
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
    </MenuTrigger>
  );
}

/** The player's own team in the masthead; opens the roster dialog. */
export function TeamBadge({ team, onPress }: { team: TeamModel; onPress: () => void }) {
  return (
    <ComicButton size="sm" onPress={onPress} className="max-w-[16rem]">
      <Swatch color={team.color} />
      <span className="truncate">{team.name}</span>
      <UsersIcon />
    </ComicButton>
  );
}

import { useRef, useState } from "react";
import { Button as AriaButton, MenuTrigger } from "react-aria-components";
import type { TeamModel, TeamSelectorModel } from "../../../headless/types";
import { ChevronDownIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";
import { TeamMenu } from "./TeamSelector";

/**
 * The board's team strip — the team's identity, score and way in, in one
 * ink-bordered control (h-10, hard shadow, level with the search box):
 * swatch bar, name lettered in Bangers, a caption saying whose board this
 * is, and the running score in a yellow tab. Pressing it opens the team
 * dialog (roster, activity). For mods it's a split button: the chevron on
 * the right opens the team list to switch which team's board they're
 * viewing — and with no team picked yet, the whole strip is that menu.
 */
export function TeamBanner({
  team,
  isOtherTeam,
  totalPoints,
  onOpen,
  onOpenPoints,
  selector,
}: {
  team: TeamModel | null;
  isOtherTeam: boolean;
  totalPoints: number | null;
  /** Opens the team dialog. */
  onOpen?: () => void;
  /** Opens the point breakdown (pressing the score tab). */
  onOpenPoints?: () => void;
  /** Mods only: the team list, for the chevron half. */
  selector?: TeamSelectorModel;
}) {
  const { colors } = useComic();
  const stripRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const swatch = team?.color ?? colors.BLUE;

  const strip = (
    <div
      ref={stripRef}
      className="flex h-10 w-full items-stretch overflow-hidden rounded-md border-[3px] md:w-auto"
      style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `3px 3px 0 ${colors.LINE}`, color: colors.INK }}
    >
      {/* Team swatch — a vertical ink-edged color bar, like a spine stripe. */}
      <span className="w-3 shrink-0 border-r-[3px]" style={{ background: swatch, borderColor: colors.LINE }} aria-hidden />

      {/* The main half: the name (and the whole strip, when there's no team yet). */}
      <AriaButton
        onPress={team ? onOpen : () => setMenuOpen(true)}
        aria-label={team ? `${team.name} — team info` : "Select team"}
        className="group flex min-w-0 flex-1 cursor-pointer items-stretch text-left outline-none transition-colors hovered:bg-[var(--comic-yellow)] focus-visible:bg-[var(--comic-yellow)]"
        style={{ ["--comic-yellow" as string]: colors.YELLOW, ["--comic-on-yellow" as string]: colors.ON_YELLOW }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <span className="truncate text-xl uppercase leading-none group-hovered:text-[var(--comic-on-yellow)] group-focus-visible:text-[var(--comic-on-yellow)]" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em" }}>
            {team?.name ?? "Select team"}
          </span>
          {team && (
            <span className="hidden whitespace-nowrap text-xs font-semibold uppercase tracking-wider group-hovered:!text-[var(--comic-on-yellow)] group-focus-visible:!text-[var(--comic-on-yellow)] sm:inline" style={{ color: colors.INK_SUBTLE }}>
              {isOtherTeam ? "Mod view" : "Your board"}
            </span>
          )}
        </span>
      </AriaButton>

      {/* The score tab: its own button, so it opens the breakdown rather than the team dialog. */}
      {team && totalPoints !== null &&
        (onOpenPoints ? (
          <AriaButton
            onPress={onOpenPoints}
            aria-label={`${team.name}: ${totalPoints.toLocaleString()} points, see the breakdown`}
            className="flex shrink-0 cursor-pointer items-center gap-1 border-l-[3px] px-3 text-xl leading-none outline-none transition-[filter] hovered:brightness-90 focus-visible:brightness-90 pressed:brightness-75"
            style={{ fontFamily: COMIC_FONT, background: colors.YELLOW, borderColor: colors.LINE, color: colors.ON_YELLOW }}
          >
            <span className="num">{totalPoints.toLocaleString()}</span>
            <span className="text-sm">pts</span>
          </AriaButton>
        ) : (
          <span
            className="flex shrink-0 items-center gap-1 border-l-[3px] px-3 text-xl leading-none"
            style={{ fontFamily: COMIC_FONT, background: colors.YELLOW, borderColor: colors.LINE, color: colors.ON_YELLOW }}
          >
            <span className="num">{totalPoints.toLocaleString()}</span>
            <span className="text-sm">pts</span>
          </span>
        ))}

      {/* The other half of the split: switch team. Only the chevron is the
          MenuTrigger (a trigger wraps every pressable inside it), so the
          main half above stays a plain button; the menu anchors under the
          whole strip. */}
      {selector && (
        <MenuTrigger isOpen={menuOpen} onOpenChange={setMenuOpen}>
          <AriaButton
            aria-label="Switch team"
            className="flex shrink-0 cursor-pointer items-center border-l-[3px] px-2 outline-none transition-colors hovered:bg-[var(--comic-yellow)] focus-visible:bg-[var(--comic-yellow)] hovered:!text-[var(--comic-on-yellow)] focus-visible:!text-[var(--comic-on-yellow)] pressed:bg-[var(--comic-yellow)] pressed:!text-[var(--comic-on-yellow)]"
            style={{ borderColor: colors.LINE, color: colors.INK, ["--comic-yellow" as string]: colors.YELLOW, ["--comic-on-yellow" as string]: colors.ON_YELLOW }}
          >
            <ChevronDownIcon />
          </AriaButton>
          <TeamMenu selector={selector} triggerRef={stripRef} />
        </MenuTrigger>
      )}
    </div>
  );

  return strip;
}

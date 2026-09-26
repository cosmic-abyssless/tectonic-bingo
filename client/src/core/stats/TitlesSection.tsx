import { TITLE_GROUPS, type ContributionCount, type PickedTitle } from "@bingo/shared";
import { PlayerName } from "../tectonic/PlayerName";
import { HEADING_FONT } from "../ui/Card";
import { EyeOffIcon, InfoIcon } from "../ui/icons";
import { TextTooltip } from "../ui/Tooltip";
import { displayName } from "../ui/user";
import { timeAgo } from "../ui/time";
import { TitleGroupBox } from "./TitleChrome";

/**
 * The Titles (shared/titles.ts) in a box per group (TitleGroupBox, the theme's), one row each: its name and quip, then who holds it and the
 * number behind it. A visible Title nobody holds says what it takes, dimmed; a hidden one only shows once someone
 * holds it, so a group can be empty and is then left out. Within a group, held visible Titles come first, then unheld
 * ones, then the hidden ones, each in pickTitles' priority order.
 */
export function TitlesSection({ picked, contributions, womReadAt }: { picked: PickedTitle[]; contributions: ContributionCount[]; womReadAt: string | null }) {
  const userById = new Map(contributions.map((c) => [c.userId, c.user]));
  const order = ({ title, holders }: PickedTitle) => (title.hidden ? 2 : holders.length ? 0 : 1);
  const groups = TITLE_GROUPS.map((group) => ({ group, titles: picked.filter((p) => p.title.group === group).sort((a, b) => order(a) - order(b)) })).filter((g) => g.titles.length > 0);
  return (
    <div className="space-y-3">
      <p className="text-xs text-on-surface-subtle">Picked from the players shown, and updated as submissions are approved. Some titles are hidden until someone earns one.</p>
      {groups.map(({ group, titles }) => (
          <TitleGroupBox key={group} group={group}>
            <ul className="divide-y divide-[var(--title-rule)]">
              {titles.map(({ title, requirement, holders }) => (
                <li
                  key={title.id}
                  // Stacked on a phone; name, quip and holders side by side from sm up.
                  className={`grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1.25fr)] sm:items-baseline ${holders.length ? "" : "opacity-60"}`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[length:var(--title-name-size,0.875rem)] font-semibold text-[var(--title-ink)]" style={HEADING_FONT}>
                      {title.name}
                    </span>
                    <TextTooltip text={title.explanation}>
                      <span role="img" aria-label={`What ${title.name} is`} className="inline-flex shrink-0 cursor-help text-on-surface-subtle hover:text-on-surface">
                        <InfoIcon size={14} />
                      </span>
                    </TextTooltip>
                    {title.hidden && (
                      <TextTooltip text="Hidden title: only shows once someone earns it">
                        <span role="img" aria-label="Hidden title" className="inline-flex shrink-0 text-on-surface-subtle">
                          <EyeOffIcon size={14} />
                        </span>
                      </TextTooltip>
                    )}
                  </div>
                  <p className="min-w-0 truncate text-xs italic text-on-surface-subtle">{title.flavour}</p>
                  <div className="min-w-0">
                    {holders.length === 0 ? (
                      <p className="text-xs text-on-surface-muted">
                        No one yet · <span className="text-on-surface-subtle">{requirement}</span>
                      </p>
                    ) : (
                      <ul className="space-y-0.5">
                        {holders.map((h) => {
                          const user = userById.get(h.userId);
                          return (
                            <li key={h.userId} className="flex min-w-0 items-baseline justify-between gap-x-3 text-sm">
                              <PlayerName userId={h.userId} badge="none" className="min-w-0 truncate font-medium text-on-surface">
                                {user ? displayName(user) : "A player"}
                              </PlayerName>
                              <span className="num shrink-0 text-xs text-on-surface-muted">{h.text}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {title.source === "wom" && <WomFreshness picked={holders} womReadAt={womReadAt} />}
                  </div>
                </li>
              ))}
            </ul>
          </TitleGroupBox>
        ))}
    </div>
  );
}

// Wise Old Man only knows what a Player last updated (usually the RuneLite plugin, on logout), so its Titles lag.
function WomFreshness({ picked, womReadAt }: { picked: PickedTitle["holders"]; womReadAt: string | null }) {
  // The holder's own gains carry the snapshot they run up to; with no holder, when WOM was last read.
  const asOf = picked.length > 0 ? picked.map((h) => h.asOf).filter((a): a is string => !!a).sort()[0] : null;
  const text = asOf ? `Wise Old Man data as of ${timeAgo(asOf)}` : womReadAt ? `Read from Wise Old Man ${timeAgo(womReadAt)}` : "Not read from Wise Old Man yet";
  return <p className="text-[11px] text-on-surface-subtle">{text}</p>;
}

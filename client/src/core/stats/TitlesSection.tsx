import type { ContributionCount, PickedTitle } from "@bingo/shared";
import { PlayerName } from "../tectonic/PlayerName";
import { displayName } from "../ui/user";
import { timeAgo } from "../ui/time";

/**
 * One card per Title (shared/titles.ts): who holds it and the number behind it. A visible Title nobody holds says
 * what it takes; a hidden one only shows once someone holds it.
 */
export function TitlesSection({ picked, contributions, womReadAt }: { picked: PickedTitle[]; contributions: ContributionCount[]; womReadAt: string | null }) {
  const userById = new Map(contributions.map((c) => [c.userId, c.user]));
  return (
    <div className="space-y-3">
      <p className="text-xs text-on-surface-subtle">Picked from the players shown, and updated as submissions are approved. Some titles are hidden until someone earns one.</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {picked.map(({ title, requirement, holders }) => (
          <li key={title.id} className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 ${holders.length ? "border-outline-strong bg-surface" : "border-dashed border-outline"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-on-surface">{title.name}</span>
              {title.hidden && <span className="shrink-0 text-[11px] text-warn">Hidden title unlocked</span>}
            </div>
            <p className="text-xs text-on-surface-muted italic">{title.flavour}</p>
            {holders.length === 0 ? (
              <p className="text-xs text-on-surface-subtle">
                No one yet. <span className="text-on-surface-muted">{requirement}.</span>
              </p>
            ) : (
              <ul className="space-y-1">
                {holders.map((h) => {
                  const user = userById.get(h.userId);
                  return (
                    <li key={h.userId} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <PlayerName userId={h.userId} badge="none" className="min-w-0 truncate font-medium text-on-surface">
                        {user ? displayName(user) : "A player"}
                      </PlayerName>
                      <span className="num text-xs text-on-surface-muted">{h.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {title.source === "wom" && <WomFreshness picked={holders} womReadAt={womReadAt} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Wise Old Man only knows what a Player last updated (usually the RuneLite plugin, on logout), so its Titles lag.
function WomFreshness({ picked, womReadAt }: { picked: PickedTitle["holders"]; womReadAt: string | null }) {
  // The holder's own gains carry the snapshot they run up to; with no holder, when WOM was last read.
  const asOf = picked.length > 0 ? picked.map((h) => h.asOf).filter((a): a is string => !!a).sort()[0] : null;
  const text = asOf ? `Wise Old Man data as of ${timeAgo(asOf)}` : womReadAt ? `Read from Wise Old Man ${timeAgo(womReadAt)}` : "Not read from Wise Old Man yet";
  return <p className="mt-auto text-[11px] text-on-surface-subtle">{text}</p>;
}

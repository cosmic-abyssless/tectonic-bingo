// The draft pool on a phone: a list of cards rather than the desktop's wide table (DraftPoolGrid), one per unit (a solo
// player or a duo pair). Each card carries what a pick is weighed on at a glance (CA tier, EHB/EHP, timezone, clan
// tier, the lead's own rating) and the Draft button; the full picture is a tap on a name away (the profile dialog).
// Search, the region filter and the sort match the table's (poolData.ts).
import { useEffect, useMemo, useState } from "react";
import { formatSignupAnswer, formatTimeZone, type DraftPoolEntry, type DraftUnit, type LeftoverMode, type PickRating, type SignupQuestion } from "@bingo/shared";
import { useStatsRefreshingSignupIds } from "../../context/WebSocketContext";
import { formatCaTier, formatWomStat } from "../signup/caStats";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Card";
import { Mark } from "../ui/gridCells";
import { LinkIcon } from "../ui/icons";
import { MultiSelect } from "../ui/MultiSelect";
import { Select, type SelectOption } from "../ui/Select";
import { TableSearchInput, matchesSearch, useTableSearch } from "../ui/tableSearch";
import { compareSortValues } from "../ui/tableSort";
import { REGION_OPTIONS, regionOf } from "../ui/timezoneFilter";
import { PlayerName } from "../tectonic/PlayerName";
import { TierBadge } from "../tectonic/ProfileBadges";
import { RatingCell } from "./RatingCell";
import { poolSearchValues, unitSortValue, type PoolRatings } from "./poolData";

// Each sort runs in the direction you'd want it: the best first for stats and ratings, A→Z for names, west→east.
const SORTS: { key: string; label: string; descending: boolean; when?: "ratings" | "profiles" }[] = [
  { key: "rating", label: "My rating", descending: true, when: "ratings" },
  { key: "caCurrent", label: "Current CA", descending: true },
  { key: "caPeak", label: "Peak CA", descending: true },
  { key: "ehb", label: "EHB", descending: true },
  { key: "ehp", label: "EHP", descending: true },
  { key: "tier", label: "Clan tier", descending: true, when: "profiles" },
  { key: "rsn", label: "Name", descending: false },
  { key: "timezone", label: "Timezone", descending: false },
];

export function DraftPoolList({
  pool,
  questions,
  ratings,
  onRate,
  canPick,
  onPick,
  picking,
  leftoverMode,
}: {
  pool: DraftUnit[];
  questions: SignupQuestion[];
  /** The viewer's team's ratings (team leads); null hides the stars. */
  ratings: PoolRatings | null;
  onRate: (signupId: string, rating: PickRating) => void;
  canPick: boolean;
  onPick: (userId: string) => void;
  picking: boolean;
  leftoverMode: LeftoverMode;
}) {
  const [search, setSearch] = useTableSearch();
  const [excludedRegions, setExcludedRegions] = useState<string[]>([]);
  const statsRefreshing = useStatsRefreshingSignupIds();
  const entries = useMemo(() => pool.flatMap((u) => u.entries), [pool]);
  const showAnswers = entries.some((e) => e.answers !== null);
  const showProfiles = entries.some((e) => e.tectonicProfile !== null);
  const sorts = SORTS.filter((s) => (s.when === "ratings" ? !!ratings : s.when === "profiles" ? showProfiles : true));
  const [sortKey, setSortKey] = useState(() => (ratings ? "rating" : "caCurrent"));
  const sort = sorts.find((s) => s.key === sortKey) ?? sorts[0]!;

  const entryMatches = (e: DraftPoolEntry) => !excludedRegions.includes(regionOf(e.signup.timezone)) && matchesSearch(poolSearchValues(e, questions), search);
  const filtering = !!search || excludedRegions.length > 0;
  // A duo pair stays if either half matches; the half that doesn't is dimmed, as in the table.
  const units = useMemo(() => {
    const shown = pool.filter((u) => u.entries.some(entryMatches));
    const r = ratings ?? {};
    return shown.sort((a, b) => {
      const order = compareSortValues(unitSortValue(a, sort.key, r, sort.descending), unitSortValue(b, sort.key, r, sort.descending));
      return sort.descending ? -order : order;
    });
    // entryMatches reads search/excludedRegions/questions, listed instead.
  }, [pool, search, excludedRegions, questions, ratings, sort.key, sort.descending]);
  const matchingCount = entries.filter(entryMatches).length;
  const mainPoolEmpty = pool.every((u) => u.leftover);
  const leftoverTag = leftoverMode === "singles" ? "Singles round" : "Cut";

  if (pool.length === 0) return <p className="text-sm text-on-surface-subtle">No one left to draft.</p>;

  const sortOptions: SelectOption[] = sorts.map((s) => ({ value: s.key, label: s.label }));
  return (
    <div className="space-y-3">
      <TableSearchInput value={search} onChange={setSearch} matchCount={matchingCount} totalCount={entries.length} />
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Sort by" value={sort.key} onChange={setSortKey} options={sortOptions} size="sm" className="w-auto!" />
        {/* Timezones only reach mods and captains, the same as the answers. */}
        {showAnswers && (
          <MultiSelect
            label="Timezone"
            options={REGION_OPTIONS.map((o) => ({ ...o, count: entries.filter((e) => regionOf(e.signup.timezone) === o.key && matchesSearch(poolSearchValues(e, questions), search)).length }))}
            selected={REGION_OPTIONS.map((o) => o.key).filter((k) => !excludedRegions.includes(k))}
            onChange={(visible) => setExcludedRegions(REGION_OPTIONS.map((o) => o.key).filter((k) => !visible.includes(k)))}
          />
        )}
      </div>
      {units.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">{search ? "No one matches this search." : "No one in the pool is in that region."}</p>
      ) : (
        <ul className="space-y-2.5">
          {units.map((unit) => {
            const draftable = !unit.leftover || (mainPoolEmpty && leftoverMode === "singles");
            return (
              <PoolCard
                key={unit.pairingId ?? unit.entries[0]!.signup.id}
                unit={unit}
                questions={questions}
                search={search}
                dimmed={(e) => filtering && !entryMatches(e)}
                statsLoading={(e) => statsRefreshing.has(e.signup.id)}
                rating={ratings ? { value: ratings[unit.entries[0]!.signup.id], onChange: (r) => onRate(unit.entries[0]!.signup.id, r) } : null}
                leftoverTag={unit.leftover ? leftoverTag : null}
                pick={canPick ? { disabled: picking || !draftable, onConfirm: () => onPick(unit.entries[0]!.user.id) } : null}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PoolCard({
  unit,
  questions,
  search,
  dimmed,
  statsLoading,
  rating,
  leftoverTag,
  pick,
}: {
  unit: DraftUnit;
  questions: SignupQuestion[];
  search: string;
  dimmed: (e: DraftPoolEntry) => boolean;
  statsLoading: (e: DraftPoolEntry) => boolean;
  /** Pairs are rated together, under the first half's signup (as in the table). */
  rating: { value: PickRating | undefined; onChange: (r: PickRating) => void } | null;
  leftoverTag: string | null;
  pick: { disabled: boolean; onConfirm: () => void } | null;
}) {
  const [answersOpen, setAnswersOpen] = useState(false);
  const pair = unit.entries.length > 1;
  const hasAnswers = unit.entries.some((e) => (e.answers?.length ?? 0) > 0);
  return (
    // data-pool-card: a hook for a theme's CSS (the comic theme gives it an ink border and hard shadow).
    <li data-pool-card="" className={`rounded-md border border-outline bg-surface-raised p-3 ${leftoverTag ? "text-on-surface-subtle" : ""}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          {unit.entries.map((e, i) => (
            <div key={e.signup.id} className={dimmed(e) ? "opacity-50" : undefined}>
              <div className="flex min-w-0 items-center gap-1.5">
                {pair && i > 0 && <LinkIcon size={12} aria-label="paired with" className="shrink-0 text-on-surface-subtle" />}
                <PlayerName userId={e.user.id} accountType={e.accountType} className="min-w-0 truncate font-semibold text-on-surface">
                  <Mark text={e.signup.rsn} query={search} />
                </PlayerName>
                {e.tectonicProfile && (
                  <span className="shrink-0 text-xs">
                    <TierBadge profile={e.tectonicProfile} showRank={false} />
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-on-surface-muted">
                <Stat label="CA" value={statsLoading(e) ? "…" : formatCaTier(e.caCurrent)} />
                <Stat label="EHB" value={statsLoading(e) ? "…" : formatWomStat(e.womStats?.ehb)} num />
                <Stat label="EHP" value={statsLoading(e) ? "…" : formatWomStat(e.womStats?.ehp)} num />
                {e.signup.timezone && <span>{formatTimeZone(e.signup.timezone)}</span>}
              </div>
            </div>
          ))}
        </div>
        {rating && (
          <div className="-mr-1 -mt-1 shrink-0">
            <RatingCell rating={rating.value} onChange={rating.onChange} />
          </div>
        )}
      </div>

      {(leftoverTag || hasAnswers) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {leftoverTag && <Badge tone="warn">{leftoverTag}</Badge>}
          {hasAnswers && (
            <button type="button" onClick={() => setAnswersOpen((o) => !o)} className="text-xs text-on-surface-subtle underline underline-offset-2 hover:text-on-surface" aria-expanded={answersOpen}>
              {answersOpen ? "Hide answers" : "Signup answers"}
            </button>
          )}
        </div>
      )}
      {answersOpen && (
        <div className="mt-2 space-y-2 border-t border-outline pt-2 text-xs">
          {unit.entries.map((e) => (
            <dl key={e.signup.id} className="space-y-1">
              {pair && <div className="font-semibold text-on-surface">{e.signup.rsn}</div>}
              {questions
                .map((q) => ({ q, a: e.answers?.find((a) => a.questionId === q.id) }))
                .filter(({ a }) => a && a.value)
                .map(({ q, a }) => (
                  <div key={q.id}>
                    <dt className="text-on-surface-subtle">{q.prompt}</dt>
                    <dd className="text-on-surface">{formatSignupAnswer(q.type, a!.value)}</dd>
                  </div>
                ))}
            </dl>
          ))}
        </div>
      )}

      {pick && <DraftButton label={pair ? "Draft pair" : "Draft"} disabled={pick.disabled} onConfirm={pick.onConfirm} />}
    </li>
  );
}

function Stat({ label, value, num }: { label: string; value: string; num?: boolean }) {
  return (
    <span>
      {label} <span className={`font-semibold text-on-surface ${num ? "num" : ""}`}>{value}</span>
    </span>
  );
}

/**
 * A pick on a phone takes two taps: the first turns the button into its confirmation, the second drafts. A stray tap
 * while scrolling the list shouldn't spend the team's pick. It lets go of the confirmation after a few seconds.
 */
function DraftButton({ label, disabled, onConfirm }: { label: string; disabled: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <Button
      variant="primary"
      className="mt-3 w-full"
      isDisabled={disabled}
      onPress={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? `Tap again to ${label.toLowerCase()}` : label}
    </Button>
  );
}

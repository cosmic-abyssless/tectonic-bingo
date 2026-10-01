import { useMemo, useState, type ReactNode } from "react";
import { titlesByHolder } from "@bingo/shared";
import { fullBoard, useBingo, useBoard, useStats } from "../../api/queries";
import { useCan } from "../../headless/permissions";
import { inclusionFilter } from "../ui/inclusionFilter";
import { MultiSelect } from "../ui/MultiSelect";
import { BetaTag } from "../ui/BetaTag";
import { Panel } from "../ui/Panel";
import { ContributorsTable } from "./ContributorsTable";
import { GpGained } from "./GpGained";
import { PointsChart } from "./PointsChart";
import { PointsShareChart } from "./PointsShareChart";
import { TileCompletion } from "./TileCompletion";
import { TimelineTable } from "./TimelineTable";
import { pickStatsTitles } from "./titles";
import { TitlesSection } from "./TitlesSection";

// A Panel, like the draft room's, so a theme that draws its own (the comic one) restyles the section and the
// tables in it the same way.
function Section({ title, beta, children }: { title: string; beta?: boolean; children: ReactNode }) {
  const heading = beta ? (
    <span className="inline-flex items-center gap-2">
      {title}
      <BetaTag />
    </span>
  ) : (
    title
  );
  return <Panel title={heading}>{children}</Panel>;
}

export function StatsView({ slug }: { slug: string }) {
  const { data: shell } = useBingo(slug);
  // Repricing a drop is a mod route (moderate_bingo).
  const canModerate = useCan("moderate_bingo", slug).allowed;
  const { data: stats, error } = useStats(slug);
  const boardData = fullBoard(useBoard(slug).data);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(() => new Set());

  // While the bingo is live the server only returns the viewer's own team, so the team list is whatever
  // actually has rows. The team filter then narrows every panel; it only shows when there's a choice to make.
  const visibleTeams = useMemo(() => {
    if (!shell || !stats) return [];
    const ids = new Set([...stats.heatmap, ...stats.pointsOverTime, ...stats.contributions].map((r) => r.teamId));
    return shell.teams.filter((t) => ids.has(t.id));
  }, [shell, stats]);
  const teamOptions = useMemo(() => visibleTeams.map((t) => ({ key: t.id, label: t.name })), [visibleTeams]);
  const teamFilter = inclusionFilter(selectedTeams, teamOptions);

  const filtered = useMemo(() => {
    if (!stats) return null;
    const pick = inclusionFilter(selectedTeams, visibleTeams.map((t) => ({ key: t.id })));
    const keep = new Set(visibleTeams.filter((t) => pick.matches(t.id)).map((t) => t.id));
    // Events with no team (the bingo going live or ending) belong to everyone, so they always stay.
    const ours = <T extends { teamId: string | null }>(rows: T[]) => rows.filter((r) => r.teamId === null || keep.has(r.teamId));
    return {
      teams: visibleTeams.filter((t) => keep.has(t.id)),
      pointsOverTime: ours(stats.pointsOverTime),
      timeline: ours(stats.timeline),
      contributions: ours(stats.contributions),
      heatmap: ours(stats.heatmap),
      teamGpGained: ours(stats.teamGpGained),
      drops: ours(stats.drops),
      titleFacts: ours(stats.titleFacts),
    };
  }, [stats, visibleTeams, selectedTeams]);

  // Titles go to the best among the Players shown: a Team's own Carry with one Team selected, the Bingo's otherwise.
  const titles = useMemo(() => (stats && filtered ? pickStatsTitles(stats, filtered.titleFacts, shell?.historical ?? null) : []), [stats, filtered, shell?.historical]);
  const titlesByPlayer = useMemo(() => titlesByHolder(titles), [titles]);

  if (error) return <div className="py-24 text-center text-sm text-on-surface-muted">{error.message}</div>;
  if (!shell || !stats || !filtered) return <div className="py-24 text-center text-sm text-on-surface-muted">Loading…</div>;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      {teamOptions.length > 1 && (
        <MultiSelect
          label="Teams"
          options={teamOptions}
          selected={teamFilter.checked}
          onChange={(visible) => setSelectedTeams(new Set(visible))}
        />
      )}

      <Section title="Points over time">
        <PointsChart points={filtered.pointsOverTime} teams={filtered.teams} />
      </Section>

      <Section title="Points share over time">
        <PointsShareChart contributions={filtered.contributions} teams={filtered.teams} />
      </Section>

      <Section title="Timeline">
        <TimelineTable events={filtered.timeline} teams={filtered.teams} startsAt={shell.bingo.effectiveStartsAt} />
      </Section>

      <Section title="Titles" beta>
        <TitlesSection picked={titles} contributions={filtered.contributions} womReadAt={stats.womReadAt} />
      </Section>

      <Section title="Top contributors">
        <ContributorsTable contributions={filtered.contributions} teams={filtered.teams} titles={titlesByPlayer} />
      </Section>

      <Section title="Total drop value">
        <GpGained slug={slug} teamGpGained={filtered.teamGpGained} drops={filtered.drops} teams={filtered.teams} canReprice={canModerate} />
      </Section>

      <Section title="Tile completion">
        <TileCompletion heatmap={filtered.heatmap} tiles={boardData?.tiles ?? []} teams={filtered.teams} />
      </Section>
    </div>
  );
}

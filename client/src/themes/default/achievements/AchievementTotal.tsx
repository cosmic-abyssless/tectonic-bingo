export function AchievementTotal({ earned, total }: { earned: number; total: number }) {
  const fraction = total > 0 ? earned / total : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-on-surface">Unlocked</div>
        <div className="num text-sm text-on-surface-muted">
          {earned} / {total}
        </div>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-accent" style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}

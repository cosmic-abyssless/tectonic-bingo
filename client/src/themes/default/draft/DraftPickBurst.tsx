export function DraftPickBurst({ names, teamName, teamColor }: { names: string[]; teamName: string; teamColor: string | null }) {
  return (
    <div className="w-[min(88vw,24rem)] rounded-xl border border-outline-strong bg-surface-raised px-6 py-5 text-center shadow-2xl">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-subtle">Drafted</div>
      <div className="mt-2 space-y-0.5">
        {names.map((name) => (
          <div key={name} className="truncate text-3xl font-bold text-on-surface">
            {name}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-sm text-on-surface-muted">
        {teamColor && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: teamColor }} />}
        <span className="truncate">to {teamName}</span>
      </div>
    </div>
  );
}

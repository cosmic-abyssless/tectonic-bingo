export function DraftPickBurst({ names, teamName, teamColor }: { names: string[]; teamName: string; teamColor: string | null }) {
  return (
    <div className="w-[min(88vw,24rem)] rounded-xl border-2 border-on-surface bg-surface-raised px-6 py-5 text-center shadow-[0_0_0_4px_rgb(0_0_0/0.35),0_20px_40px_-10px_rgb(0_0_0/0.6)]">
      <div className="text-sm font-bold uppercase tracking-[0.25em] text-accent">Drafted</div>
      <div className="mt-2 space-y-0.5">
        {names.map((name) => (
          <div key={name} className="truncate text-3xl font-bold text-on-surface">
            {name}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-base font-medium text-on-surface">
        {teamColor && <span className="size-3.5 shrink-0 rounded-full border border-on-surface" style={{ backgroundColor: teamColor }} />}
        <span className="truncate">to {teamName}</span>
      </div>
    </div>
  );
}

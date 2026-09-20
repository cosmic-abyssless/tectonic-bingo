import { fitFontSize } from "../../../core/draft/revealMath";

export function DraftPickBurst({ names, teamName, teamColor }: { names: string[]; teamName: string; teamColor: string | null }) {
  // Long names shrink to fit the card (rem) rather than being cut off, and only wrap once they are at the smallest size.
  const nameSize = fitFontSize(names, { availableWidth: 21, charWidth: 0.64, max: 1.875, min: 0.85 });
  const teamSize = fitFontSize([teamName], { availableWidth: 18, charWidth: 0.6, max: 1, min: 0.7 });
  return (
    <div className="w-[min(88vw,24rem)] rounded-xl border-2 border-on-surface bg-surface-raised px-6 py-5 text-center shadow-pop">
      <div className="text-sm font-bold uppercase tracking-[0.25em] text-accent">Drafted</div>
      <div className="mt-2 space-y-0.5">
        {names.map((name) => (
          <div key={name} className="font-bold leading-tight text-on-surface [overflow-wrap:anywhere]" style={{ fontSize: `${nameSize}rem` }}>
            {name}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 font-medium text-on-surface" style={{ fontSize: `${teamSize}rem` }}>
        {teamColor && <span className="size-3.5 shrink-0 rounded-full border border-on-surface" style={{ backgroundColor: teamColor }} />}
        <span className="[overflow-wrap:anywhere]">to {teamName}</span>
      </div>
    </div>
  );
}

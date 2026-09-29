import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// PROTOTYPE (throwaway, #315): a floating bar that cycles a page's `?variant=` (and, optionally, a second param such as
// `?fill=`). Dev builds only. Delete with the prototype.

export const PROTOTYPES_ON = import.meta.env.DEV;

export function usePrototypeParam(name: string, keys: string[]): string {
  const [params] = useSearchParams();
  const v = params.get(name);
  return v && keys.includes(v) ? v : keys[0]!;
}

export function PrototypeSwitcher({
  variants,
  names,
  fills,
  note,
}: {
  variants: string[];
  names: Record<string, string>;
  /** A second axis, cycled with ↑ / ↓. */
  fills?: string[];
  /** Extra state to surface, e.g. which fields a card had to leave out. */
  note?: string;
}) {
  const [params, setParams] = useSearchParams();
  const variant = usePrototypeParam("variant", variants);
  const fill = usePrototypeParam("fill", fills ?? [""]);

  const set = (name: string, list: string[], current: string, step: number) => {
    const next = list[(list.indexOf(current) + step + list.length) % list.length]!;
    const p = new URLSearchParams(params);
    p.set(name, next);
    setParams(p, { replace: true, preventScrollReset: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") set("variant", variants, variant, -1);
      else if (e.key === "ArrowRight") set("variant", variants, variant, 1);
      else if (fills && e.key === "ArrowUp") set("fill", fills, fill, -1);
      else if (fills && e.key === "ArrowDown") set("fill", fills, fill, 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!PROTOTYPES_ON) return null;
  const btn = "rounded-full px-2 py-0.5 hover:bg-white/15";
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl bg-fuchsia-600 px-3 py-2 text-sm font-semibold text-white shadow-2xl ring-2 ring-black/40">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest opacity-70">Prototype</span>
        <button className={btn} onClick={() => set("variant", variants, variant, -1)} aria-label="Previous variant">
          ←
        </button>
        <span className="min-w-44 text-center">
          {variant} ({names[variant]})
        </span>
        <button className={btn} onClick={() => set("variant", variants, variant, 1)} aria-label="Next variant">
          →
        </button>
        {fills && (
          <>
            <span className="opacity-50">|</span>
            <button className={btn} onClick={() => set("fill", fills, fill, 1)}>
              data: {fill} ↕
            </button>
          </>
        )}
      </div>
      {note && <p className="max-w-md text-center text-[11px] font-normal opacity-90">{note}</p>}
    </div>
  );
}

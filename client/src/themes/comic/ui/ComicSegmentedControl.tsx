import type { ReactNode } from "react";
import { COMIC_FONT } from "../font";
import { useComic } from "./useComic";

export type ComicSegment<K extends string> = { id: K; label: ReactNode | ((picked: boolean) => ReactNode) };

/**
 * The comic SegmentedControl: a row of chunky ink tabs, the picked one yellow and standing up off the page, the rest
 * pressed flat. Each is a toggle button (`aria-pressed`). A label can be a function of whether it's picked.
 */
export function ComicSegmentedControl<K extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  options: readonly ComicSegment<K>[];
  value: K | null;
  onChange: (id: K) => void;
  "aria-label"?: string;
}) {
  const { colors } = useComic();
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const picked = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={picked}
            className="comic-press flex min-w-24 flex-1 items-center justify-center gap-2 border-[3px] px-3 py-1.5 text-lg uppercase leading-none tracking-wide"
            style={{
              fontFamily: COMIC_FONT,
              borderColor: colors.LINE,
              background: picked ? colors.YELLOW : colors.PAPER_RAISED,
              color: picked ? colors.ON_YELLOW : colors.INK_SUBTLE,
              boxShadow: picked ? `3px 3px 0 ${colors.SHADOW}` : "none",
              transform: picked ? undefined : "translate(2px,2px)",
            }}
          >
            {typeof option.label === "function" ? option.label(picked) : option.label}
          </button>
        );
      })}
    </div>
  );
}

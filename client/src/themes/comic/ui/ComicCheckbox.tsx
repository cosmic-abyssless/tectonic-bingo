import { useId, type ReactNode } from "react";
import { CheckIcon } from "../../../core/ui/icons";
import { useComic } from "./useComic";

/**
 * The comic Checkbox (or, with `type="radio"`, radio button): a chunky chip that goes yellow and stands up off the page
 * when chosen. A real radio or checkbox underneath (hidden, still focusable), so keyboards and screen readers get the
 * native control. `hint` is visible text under it, read out as its description.
 */
export function ComicCheckbox({
  type = "checkbox",
  name,
  checked,
  onChange,
  hint,
  children,
}: {
  type?: "checkbox" | "radio";
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useComic();
  const hintId = useId();
  const chip = (
    <label
      className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border-[3px] px-2.5 py-1.5 text-sm font-semibold outline-offset-2 transition-[box-shadow,background-color] duration-150 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-solid"
      style={{
        borderColor: colors.LINE,
        outlineColor: colors.BLUE,
        background: checked ? colors.YELLOW : colors.PAPER_RAISED,
        color: checked ? colors.ON_YELLOW : colors.INK,
        boxShadow: `${checked ? 3 : 1}px ${checked ? 3 : 1}px 0 ${colors.SHADOW}`,
      }}
    >
      <input type={type} name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? hintId : undefined} className="sr-only" />
      <span
        aria-hidden
        className={`flex size-4 shrink-0 items-center justify-center border-2 ${type === "radio" ? "rounded-full" : "rounded-[3px]"}`}
        style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, color: colors.INK }}
      >
        {checked && (type === "radio" ? <span className="size-2 rounded-full" style={{ background: colors.INK }} /> : <CheckIcon size={12} />)}
      </span>
      {children}
    </label>
  );
  if (!hint) return chip;
  return (
    <div>
      {chip}
      <p id={hintId} className="mt-1.5 text-xs" style={{ color: colors.INK_SUBTLE }}>
        {hint}
      </p>
    </div>
  );
}

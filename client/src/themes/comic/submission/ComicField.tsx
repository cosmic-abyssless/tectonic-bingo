import type { ReactNode } from "react";
import { COMIC_FONT } from "../font";
import { useComic } from "../ui/useComic";

/**
 * Form label styled as a small caption tab sitting on the top-left edge of
 * the control. `as="div"` for groups that aren't a single labelled input.
 */
export function ComicField({
  label,
  hint,
  children,
  className,
  as: Tag = "label",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "label" | "div";
}) {
  const { colors } = useComic();
  return (
    <Tag className={`block ${className ?? ""}`}>
      <span
        // Overlaps the control's own 3px top border (-mb) so the tab reads as
        // a folder tab attached to the field, not a caption floating above it.
        className="relative z-[1] -mb-[3px] inline-block rounded-t-sm border-[3px] border-b-0 px-2 pb-0.5 pt-px text-base uppercase leading-none tracking-wide"
        style={{ fontFamily: COMIC_FONT, borderColor: colors.LINE, background: colors.YELLOW, color: colors.ON_YELLOW }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-xs" style={{ color: colors.INK_SUBTLE }}>
          {hint}
        </span>
      )}
    </Tag>
  );
}

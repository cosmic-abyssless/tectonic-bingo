import type { ReactNode } from "react";
import { useOptionalSlot } from "../../themes/context";

export interface SuperlativeGroupBoxProps {
  name: string;
  children: ReactNode;
}

/**
 * One Superlative category (CONTEXT.md) as a banner in the Team info dialog, styled like the Titles page's
 * TitleGroupBox (see core/stats/TitleChrome): a labelled box, drawn the theme's way through the SuperlativeGroupBox
 * slot. Unlike a Title group, one category is one row — the box's label is the category's own name.
 */
export function SuperlativeGroupBox(props: SuperlativeGroupBoxProps) {
  const Themed = useOptionalSlot("SuperlativeGroupBox");
  return Themed ? <Themed {...props} /> : <PlainSuperlativeGroupBox {...props} />;
}

export function PlainSuperlativeGroupBox({ name, children }: SuperlativeGroupBoxProps) {
  return (
    <section className="rounded-lg border border-outline bg-surface px-3 pb-3 pt-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-subtle">{name}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

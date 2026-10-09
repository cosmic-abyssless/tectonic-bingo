import type { CSSProperties, ReactNode } from "react";
import { Button as AriaButton, Disclosure as AriaDisclosure, DisclosurePanel, Heading } from "react-aria-components";
import { ChevronDownIcon, SpinnerIcon } from "../../../core/ui/icons";
import type { ComicColors } from "../board/colors";
import { COMIC_FONT } from "../font";
import { CaptionBox } from "../ui/CaptionBox";
import { comicVars, useComic } from "../ui/useComic";
import { LETTERED } from "../../lettering";

// The pieces the comic signup stage is drawn with: sheets on the palette's own paper (charcoal in the dark palettes),
// like the draft room's panels, with the fields, stats and lists right on them in the same palette.

/**
 * The chrome tokens the core form controls (Input, Select, Textarea, SearchableSelect) read, pointed at the page
 * palette: inside a `comic-fields` scope set to these, a core control is paper with ink lettering, and comic.css gives
 * it the ink border and hard shadow. comicVars too, for that CSS.
 */
export function paperVars(c: ComicColors): CSSProperties {
  return {
    ...comicVars(c),
    color: c.INK,
    "--field-bg": c.PAPER_RAISED,
    "--color-surface": c.PAPER,
    "--color-surface-raised": c.PAPER_RAISED,
    // A hovered option in a dropdown: the raised fill lifted a little toward the lettering (a lighter grey on charcoal,
    // a darker shade on papyrus). The yellow tint read as a muddy olive on the dark palettes.
    "--color-surface-hover": `color-mix(in srgb, ${c.PAPER_RAISED} 82%, ${c.INK})`,
    "--color-outline": c.LINE,
    "--color-outline-strong": c.LINE,
    "--color-on-surface": c.INK,
    "--color-on-surface-muted": c.INK_BODY,
    "--color-on-surface-subtle": c.INK_SUBTLE,
    // The highlighted row of a SearchableSelect's list: yellow, as in the board's tile search.
    "--color-accent": c.YELLOW,
    "--color-on-accent": c.ON_YELLOW,
    "--color-ok": c.OK,
    "--color-warn": c.WARN,
    "--color-danger": c.BAD,
    "--color-info": c.INFO,
  } as CSSProperties;
}

/** The step number of a duo signup (1. sign up, 2. partner): a yellow roundel, knocked a little askew. */
function StepRoundel({ step }: { step: number }) {
  const { colors } = useComic();
  return (
    <span
      aria-hidden
      className={`${LETTERED} flex size-10 shrink-0 items-center justify-center rounded-full border-[3px] text-2xl leading-none`}
      style={{ fontFamily: COMIC_FONT, background: colors.YELLOW, color: colors.ON_YELLOW, borderColor: colors.LINE, boxShadow: `2px 2px 0 ${colors.SHADOW}`, transform: "rotate(-8deg)" }}
    >
      {step}
    </span>
  );
}

function SheetTitle({ step, title, description }: { step?: number; title: ReactNode; description?: ReactNode }) {
  const { colors } = useComic();
  return (
    <>
      {step !== undefined && <StepRoundel step={step} />}
      <div className="min-w-0 flex-1">
        <span className={`${LETTERED} block text-2xl uppercase leading-none`} style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", color: colors.INK }}>
          {title}
        </span>
        {description && (
          // Inside the heading, which balances its lines: this is a sentence, so it wraps as one.
          <span className="mt-1 block text-sm [text-wrap:pretty]" style={{ color: colors.INK_BODY }}>
            {description}
          </span>
        )}
      </div>
    </>
  );
}

// Not tilted, unlike the caption boxes: a transformed ancestor would become the containing block of a
// SearchableSelect's fixed-position list, and pull the list away from its field.
function sheetStyle(colors: ComicColors): CSSProperties {
  return { background: colors.PAPER, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.SHADOW}`, color: colors.INK_BODY };
}

/** A panel of the signup stage: paper, an ink border and a hard shadow, with a lettered header. */
export function Sheet({ step, title, description, badge, children }: { step?: number; title: ReactNode; description?: ReactNode; badge?: ReactNode; children: ReactNode }) {
  const { colors } = useComic();
  return (
    <section className="relative mx-auto max-w-lg border-[3px]" style={sheetStyle(colors)}>
      <Heading level={2} className="m-0 flex items-center gap-3 border-b-[3px] px-4 py-3" style={{ borderColor: colors.LINE }}>
        <SheetTitle step={step} title={title} description={description} />
      </Heading>
      {badge}
      <div className="space-y-5 p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** A Sheet whose whole header opens and closes it (the signup form, folded away once saved). */
export function CollapsibleSheet({
  step,
  title,
  description,
  badge,
  isExpanded,
  onExpandedChange,
  children,
}: {
  step?: number;
  title: ReactNode;
  description?: ReactNode;
  /** Pressed onto the header, over the chevron's corner (the "Saved!" stamp). */
  badge?: ReactNode;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  children: ReactNode;
}) {
  const { colors } = useComic();
  return (
    <AriaDisclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange} className="group relative mx-auto max-w-lg border-[3px]" style={sheetStyle(colors)}>
      <Heading level={2} className="m-0">
        <AriaButton
          slot="trigger"
          className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-[var(--sheet-hover)] focus-visible:bg-[var(--sheet-hover)]"
          style={{ ["--sheet-hover" as string]: colors.PAPER_ALT }}
        >
          <SheetTitle step={step} title={title} description={description} />
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] transition-transform duration-200 group-expanded:rotate-180"
            style={{ background: colors.PAPER_RAISED, borderColor: colors.LINE, color: colors.INK }}
          >
            <ChevronDownIcon size={16} />
          </span>
        </AriaButton>
      </Heading>
      {badge}
      {/* Border and padding on an inner div: the collapsed panel is hidden with content-visibility, which still
          paints the panel's own box. */}
      <DisclosurePanel>
        <div className="space-y-5 border-t-[3px] p-4 sm:p-5" style={{ borderColor: colors.LINE }}>
          {children}
        </div>
      </DisclosurePanel>
    </AriaDisclosure>
  );
}

export type CalloutTone = "warn" | "danger" | "ok" | "info";

/** A notice inside a sheet: a tinted caption box, its icon in the tone's own ink. */
export function Callout({ tone, icon, children }: { tone: CalloutTone; icon?: ReactNode; children: ReactNode }) {
  const { colors } = useComic();
  const fill = ({ warn: "yellow", danger: "red", ok: "green", info: "blue" } as const)[tone];
  const ink = { warn: colors.WARN, danger: colors.BAD, ok: colors.OK, info: colors.INFO }[tone];
  return (
    <div role={tone === "danger" ? "alert" : undefined}>
      <CaptionBox tone={fill}>
        <div className="flex items-start gap-2.5 text-sm">
          {icon && (
            <span className="mt-0.5 shrink-0" style={{ color: ink }}>
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </CaptionBox>
    </div>
  );
}

/** The red asterisk of a required question. */
export function Required() {
  const { colors } = useComic();
  return (
    <span className="ml-1" style={{ color: colors.RED }}>
      *
    </span>
  );
}

/** A question's label as a yellow tab, like ComicField's, for a group of choices (a fieldset's legend). */
export function TabLegend({ children }: { children: ReactNode }) {
  const { colors } = useComic();
  return (
    <legend
      className={`${LETTERED} mb-2 inline-block rounded-sm border-[3px] px-2 pb-0.5 pt-px text-base uppercase leading-none tracking-wide`}
      style={{ fontFamily: COMIC_FONT, borderColor: colors.LINE, background: colors.YELLOW, color: colors.ON_YELLOW }}
    >
      {children}
    </legend>
  );
}

/** A read-only stat on the signup (their combat achievements): a lettered value on a raised card. */
export function StatBox({ label, value, note, loading }: { label: string; value: string; note?: string; loading?: boolean }) {
  const { colors } = useComic();
  return (
    <div className="min-w-0 border-[3px] px-3 py-2" style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `3px 3px 0 ${colors.SHADOW}` }}>
      <div className={`${LETTERED} text-sm uppercase leading-none tracking-wide`} style={{ fontFamily: COMIC_FONT, color: colors.INK_SUBTLE }}>
        {label}
      </div>
      <div className={`${LETTERED} mt-1 flex items-center gap-2 text-2xl uppercase leading-none`} style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
        {loading ? (
          <>
            <SpinnerIcon size={16} /> <span className="text-lg">Looking up…</span>
          </>
        ) : (
          value
        )}
      </div>
      {note && !loading && (
        <div className="mt-1 text-xs" style={{ color: colors.INK_SUBTLE }}>
          {note}
        </div>
      )}
    </div>
  );
}

/** A small caption over a list or group inside a sheet ("Signed up without a partner (36)"). */
export function SubHead({ children }: { children: ReactNode }) {
  const { colors } = useComic();
  return (
    <p className={`${LETTERED} text-lg uppercase leading-none tracking-wide`} style={{ fontFamily: COMIC_FONT, color: colors.INK }}>
      {children}
    </p>
  );
}

/** An ink-bordered list of people, one per row, on a raised card. */
export function RowList({ children, scroll }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useComic();
  return (
    <ul
      className={`comic-rows border-[3px] ${scroll ? "max-h-64 overflow-y-auto" : ""}`}
      style={{ borderColor: colors.LINE, background: colors.PAPER_RAISED, boxShadow: `3px 3px 0 ${colors.SHADOW}`, ["--comic-rule" as string]: colors.RULE }}
    >
      {children}
    </ul>
  );
}

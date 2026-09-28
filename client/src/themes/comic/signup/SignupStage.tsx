import { useRef, type ReactNode } from "react";
import { useSignupForm, type SignupFormModel, type SignupQuestionModel } from "../../../headless";
import { Input, Textarea } from "../../../core/ui/Field";
import { Select } from "../../../core/ui/Select";
import { SearchableSelect } from "../../../core/ui/SearchableSelect";
import { AlertIcon, CheckIcon, LockIcon, XIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicField } from "../submission/ComicField";
import { ComicButton } from "../ui/ComicButton";
import { Stamp } from "../ui/Stamp";
import { useComic } from "../ui/useComic";
import { PartnerSheet } from "./PartnerSheet";
import { Callout, ChoiceChip, CollapsibleSheet, paperVars, Required, StatBox, TabLegend } from "./parts";

/**
 * The signup stage in the comic theme: the form (and, in a duo bingo, the partner step under it) as sheets on the
 * palette's own paper (charcoal in the dark palettes), like the draft room's panels, with the fields, stats and lists
 * right on it. Ink-bordered sheets with lettered headers, yellow tab labels,
 * answers as chips, comic buttons; the core form controls take their colours from paperVars and their ink border from
 * comic.css.
 */
export function SignupStage({ slug }: { slug: string }) {
  const { colors } = useComic();
  return (
    <div data-portal-scope="" className="comic-fields space-y-8" style={paperVars(colors)}>
      <SignupSheets slug={slug} />
    </div>
  );
}

function SignupSheets({ slug }: { slug: string }) {
  const form = useSignupForm(slug);
  if (form.status === "loading") return null;
  if (form.block) return <Blocked form={form} />;
  return (
    <>
      <SignupSheet form={form} />
      {form.isDuo && form.signedUp && <PartnerSheet slug={slug} />}
    </>
  );
}

/** Can't sign up (yet): the reason, stamped. */
function Blocked({ form }: { form: SignupFormModel }) {
  const { colors } = useComic();
  const block = form.block!;
  const { title, body, stamp } =
    block.reason === "unavailable"
      ? { title: "Signups are on hold", body: block.message, stamp: "Offline" }
      : block.reason === "notInGuild"
        ? { title: "Not in the clan's Discord", body: "Your Discord account isn't in the Tectonic Discord server, so you can't sign up. Join the server, then log out and back in.", stamp: "Locked" }
        : { title: "Clan members only", body: "You're in the Discord server, but the clan bot doesn't have you registered as a member. Ask a moderator to check your clan registration.", stamp: "Locked" };
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-3 border-[3px] px-5 py-7 text-center" style={{ background: colors.PAPER, borderColor: colors.LINE, boxShadow: `4px 4px 0 ${colors.SHADOW}` }}>
      <Stamp kind="custom" rotate={-6} size="md">
        {block.reason === "unavailable" ? <AlertIcon size={16} className="mr-1.5" /> : <LockIcon size={16} className="mr-1.5" />}
        {stamp}
      </Stamp>
      <h2 className="mt-2 text-3xl uppercase leading-none" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", color: colors.INK }}>
        {title}
      </h2>
      <p className="max-w-md text-sm" style={{ color: colors.INK_BODY }}>
        {body}
      </p>
    </section>
  );
}

function SignupSheet({ form }: { form: SignupFormModel }) {
  const { colors } = useComic();
  const { rsn, timezone, ca, withdraw } = form;

  return (
    <CollapsibleSheet
      // A duo bingo's two steps are numbered: this, then picking a partner (PartnerSheet).
      step={form.isDuo ? 1 : undefined}
      title={form.signedUp ? "Edit your signup" : "Sign up!"}
      description={form.signedUp ? (form.teamLead ?? "You can update your answers or withdraw while signups are open.") : "Fill this out to join the bingo."}
      badge={
        // Slammed onto the header as the form folds away, instead of a "Saved." line.
        form.saved && (
          <>
            <Stamp kind="custom" animate rotate={-10} size="sm" className="absolute -top-3 right-12 z-[2]" style={{ color: colors.OK, borderColor: colors.OK, boxShadow: `0 0 0 2px ${colors.PAPER_RAISED}, 0 0 0 4px ${colors.OK}` }}>
              Saved!
            </Stamp>
            {/* The stamp is decoration (aria-hidden): this is what a screen reader hears. */}
            <span role="status" className="sr-only">
              Saved.
            </span>
          </>
        )
      }
      isExpanded={form.expanded}
      onExpandedChange={form.setExpanded}
    >
      {form.atRisk && (
        <Callout tone="warn" icon={<AlertIcon />}>
          {form.atRisk.reason === "pairs_only"
            ? "Only pairs are drafted in this bingo, so you'll be left out of the draft unless you pair up with someone."
            : "Every team drafts the same number of players, and you're among the newest signups that don't split evenly across the teams right now. You'll be left out of the draft unless more players sign up or another team is added."}
        </Callout>
      )}

      {rsn.options ? (
        <ComicField
          label={<RequiredLabel>RuneScape name</RequiredLabel>}
          hint={
            rsn.verified ? (
              <span className="inline-flex items-center gap-1 font-semibold" style={{ color: colors.OK }}>
                <CheckIcon size={12} /> Verified against your linked clan account
              </span>
            ) : (
              <span className="font-semibold" style={{ color: colors.WARN }}>
                This RSN isn't currently linked to your clan account
              </span>
            )
          }
        >
          <Select value={rsn.value} onChange={rsn.set} options={rsn.options.map((name) => ({ value: name, label: name }))} />
        </ComicField>
      ) : (
        <ComicField label={<RequiredLabel>RuneScape name</RequiredLabel>}>
          <Input value={rsn.value} onChange={(e) => rsn.set(e.target.value)} maxLength={12} />
        </ComicField>
      )}

      <ComicField
        label={<RequiredLabel>Timezone</RequiredLabel>}
        hint={timezone.fromBrowser ? "Filled in from your browser. Change it if that's not where you'll be playing from." : "Search by city, region or UTC offset."}
      >
        <SearchableSelect value={timezone.value} options={timezone.options} placeholder="Search for your timezone…" onChange={timezone.set} />
      </ComicField>

      {form.questions.map((q) => (
        <Question key={q.id} question={q} />
      ))}

      {ca && (
        <div className={`grid gap-3 ${ca.peak ? "grid-cols-2" : "grid-cols-1"}`}>
          <StatBox label="Current CA" value={ca.current.tier} note={ca.current.title} loading={ca.current.loading} />
          {ca.peak && <StatBox label="Peak CA" value={ca.peak.tier} note={ca.peak.found ? ca.peak.title : undefined} loading={ca.peak.loading} />}
        </div>
      )}

      {form.error && <Callout tone="danger" icon={<AlertIcon />}>{form.error}</Callout>}

      {withdraw.confirming ? (
        <Callout tone="danger">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex-1 font-semibold">Withdraw your signup?</span>
            <ComicButton size="sm" variant="ghost" onPress={withdraw.cancel} sfx={false}>
              Cancel
            </ComicButton>
            <ComicButton size="sm" variant="danger" onPress={withdraw.confirm} isDisabled={withdraw.pending}>
              Withdraw
            </ComicButton>
          </div>
        </Callout>
      ) : (
        <div className="flex gap-3 pt-1">
          <ComicButton variant="primary" className="flex-1" onPress={form.submit} isDisabled={!form.isValid || form.pending}>
            {form.pending ? "Saving…" : form.signedUp ? "Save changes" : "Sign me up!"}
          </ComicButton>
          {form.signedUp && !form.teamLead && (
            <ComicButton variant="danger" onPress={withdraw.ask} sfx={false}>
              Withdraw
            </ComicButton>
          )}
        </div>
      )}
    </CollapsibleSheet>
  );
}

function RequiredLabel({ children, required = true }: { children: ReactNode; required?: boolean }) {
  return (
    <>
      {children}
      {required && <Required />}
    </>
  );
}

function Hint({ children, className }: { children: ReactNode; className?: string }) {
  const { colors } = useComic();
  return (
    <p className={`text-xs ${className ?? ""}`} style={{ color: colors.INK_SUBTLE }}>
      {children}
    </p>
  );
}

function Question({ question }: { question: SignupQuestionModel }) {
  const label = <RequiredLabel required={question.required}>{question.prompt}</RequiredLabel>;

  if (question.type === "boolean") {
    return (
      <div>
        <ChoiceChip type="checkbox" checked={question.value === "true"} onChange={(on) => question.set(on ? "true" : "false")}>
          {label}
        </ChoiceChip>
        {question.hint && <Hint className="mt-1.5">{question.hint}</Hint>}
      </div>
    );
  }

  if (question.type === "select" || question.type === "multiselect") {
    return <ChoiceQuestion question={question} label={label} />;
  }

  if (question.type === "member") {
    return <MemberPickQuestion question={question} label={label} />;
  }

  return (
    <ComicField label={label} hint={question.hint}>
      {question.type === "textarea" ? (
        <Textarea value={question.value} onChange={(e) => question.set(e.target.value)} rows={3} className="resize-none" />
      ) : (
        <Input value={question.value} onChange={(e) => question.set(e.target.value)} />
      )}
    </ComicField>
  );
}

/** A Member pick: a search box over the clan's members, with several picks as yellow chips that can be taken off. */
function MemberPickQuestion({ question, label }: { question: SignupQuestionModel; label: ReactNode }) {
  const { colors } = useComic();
  const members = question.members!;
  const limit = members.max !== null ? `Pick up to ${members.max}.` : null;
  const hint = [limit, question.hint].filter(Boolean).join(" ") || undefined;
  const placeholder = members.loading ? "Loading members…" : members.full ? "That's the most you can pick" : "Search by RSN or Discord name…";
  return (
    <ComicField as="div" label={label} hint={hint}>
      <SearchableSelect value={members.multiple ? "" : (members.picked[0]?.id ?? "")} options={members.options} placeholder={placeholder} onChange={members.pick} readOnly={members.loading || members.full} />
      {members.multiple && members.picked.length > 0 && (
        <ul aria-label={`Picked for ${question.prompt}`} className="mt-2 flex flex-wrap gap-2">
          {members.picked.map((p) => (
            <li
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-md border-[3px] py-1 pr-1.5 pl-2.5 text-sm font-semibold"
              style={{ borderColor: colors.LINE, background: colors.YELLOW, color: colors.ON_YELLOW, boxShadow: `2px 2px 0 ${colors.SHADOW}` }}
            >
              {p.name}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={p.remove} className="rounded-sm p-0.5 hover:opacity-70">
                <XIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {question.clear && (
        <button type="button" onClick={question.clear} className="mt-1.5 px-1 text-xs underline underline-offset-2 hover:opacity-70" style={{ color: colors.INK_SUBTLE }}>
          Clear
        </button>
      )}
    </ComicField>
  );
}

function ChoiceQuestion({ question, label }: { question: SignupQuestionModel; label: ReactNode }) {
  const { colors } = useComic();
  const multiple = question.type === "multiselect";
  const { other } = question;
  const otherInput = useRef<HTMLInputElement>(null);
  return (
    <fieldset>
      <TabLegend>{label}</TabLegend>
      <div className="flex flex-wrap gap-2">
        {question.choices.map((choice) => (
          <ChoiceChip key={choice.label} type={multiple ? "checkbox" : "radio"} name={multiple ? undefined : `question-${question.id}`} checked={choice.checked} onChange={choice.set}>
            {choice.label}
          </ChoiceChip>
        ))}
        {other && (
          <ChoiceChip
            type={multiple ? "checkbox" : "radio"}
            name={multiple ? undefined : `question-${question.id}`}
            checked={other.checked}
            onChange={(on) => {
              other.set(on);
              // Picking Other is for writing in it: go straight to the box.
              if (on) requestAnimationFrame(() => otherInput.current?.focus());
            }}
          >
            Other
          </ChoiceChip>
        )}
        {question.clear && (
          <button type="button" onClick={question.clear} className="px-1 text-xs underline underline-offset-2 hover:opacity-70" style={{ color: colors.INK_SUBTLE }}>
            Clear
          </button>
        )}
      </div>
      {other?.checked && (
        <Input
          ref={otherInput}
          aria-label={`Other answer to ${question.prompt}`}
          aria-invalid={other.missingText || undefined}
          value={other.text}
          onChange={(e) => other.setText(e.target.value)}
          maxLength={other.maxLength}
          placeholder="Your answer"
          className="mt-2"
        />
      )}
      {other?.missingText && <Hint className="mt-1.5">Write your answer for Other, or untick it.</Hint>}
      {question.hint && <Hint className="mt-1.5">{question.hint}</Hint>}
    </fieldset>
  );
}

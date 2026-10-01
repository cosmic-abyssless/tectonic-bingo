import { useRef } from "react";
import { useSignupForm, type SignupQuestionModel } from "../../headless/useSignupForm";
import { PartnerPanel } from "./PartnerPanel";
import { Button, IconButton } from "../ui/Button";
import { EmptyState, HEADING_FONT, Notice } from "../ui/Card";
import { Disclosure } from "../ui/Disclosure";
import { Field, Input, Textarea } from "../ui/Field";
import { Select } from "../ui/Select";
import { SearchableSelect } from "../ui/SearchableSelect";
import { AlertIcon, CheckIcon, LockIcon, XIcon } from "../ui/icons";

/** A group of radio buttons or checkboxes under one label, for the choice questions. */
function ChoiceGroup({ question, label }: { question: SignupQuestionModel; label: React.ReactNode }) {
  const multiple = question.type === "multiselect";
  const { other } = question;
  const otherInput = useRef<HTMLInputElement>(null);
  return (
    <fieldset>
      <legend className="mb-1.5 block text-xs font-medium text-on-surface-muted">{label}</legend>
      <div className="space-y-2">
        {question.choices.map((choice) => (
          <label key={choice.label} className="flex cursor-pointer select-none items-center gap-2.5">
            <input
              type={multiple ? "checkbox" : "radio"}
              name={multiple ? undefined : `question-${question.id}`}
              checked={choice.checked}
              onChange={(e) => choice.set(e.target.checked)}
              className="size-4 cursor-pointer accent-accent"
            />
            <span className="text-sm text-on-surface">{choice.label}</span>
          </label>
        ))}
        {other && (
          <div className="flex min-h-8 items-center gap-2.5">
            <label className="flex shrink-0 cursor-pointer select-none items-center gap-2.5">
              <input
                type={multiple ? "checkbox" : "radio"}
                name={multiple ? undefined : `question-${question.id}`}
                checked={other.checked}
                onChange={(e) => {
                  other.set(e.target.checked);
                  // Picking Other is for writing in it: go straight to the box.
                  if (e.target.checked) requestAnimationFrame(() => otherInput.current?.focus());
                }}
                className="size-4 cursor-pointer accent-accent"
              />
              <span className="text-sm text-on-surface">Other</span>
            </label>
            {other.checked && (
              <Input
                ref={otherInput}
                aria-label={`Other answer to ${question.prompt}`}
                aria-invalid={other.missingText || undefined}
                value={other.text}
                onChange={(e) => other.setText(e.target.value)}
                maxLength={other.maxLength}
                placeholder="Your answer"
                size="sm"
                className="min-w-0 flex-1"
              />
            )}
          </div>
        )}
      </div>
      {other?.missingText && <p className="mt-1.5 text-xs text-danger">Write your answer for Other, or untick it.</p>}
      {question.clear && (
        <button type="button" onClick={question.clear} className="mt-1.5 text-xs text-on-surface-subtle underline underline-offset-2 hover:text-on-surface">
          Clear
        </button>
      )}
      {question.hint && <p className="mt-1.5 text-xs text-on-surface-subtle">{question.hint}</p>}
    </fieldset>
  );
}

/**
 * A Member pick: a search box over the clan's members. With one pick the box shows the pick and a new one replaces
 * it; with several each pick becomes a removable chip under it, until the maximum.
 */
function MemberPickField({ question, label }: { question: SignupQuestionModel; label: React.ReactNode }) {
  const members = question.members!;
  const limit = members.max !== null ? `Pick up to ${members.max}.` : null;
  const hint = [limit, question.hint].filter(Boolean).join(" ") || undefined;
  const placeholder = members.loading ? "Loading members…" : members.full ? "That's the most you can pick" : "Search by RSN or Discord name…";
  return (
    <Field as="div" label={label} hint={hint}>
      <SearchableSelect
        value={members.multiple ? "" : (members.picked[0]?.id ?? "")}
        options={members.options}
        placeholder={placeholder}
        onChange={members.pick}
        readOnly={members.loading || members.full}
      />
      {members.multiple && members.picked.length > 0 && (
        <ul aria-label={`Picked for ${question.prompt}`} className="mt-2 flex flex-wrap gap-1.5">
          {members.picked.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-full border border-outline bg-surface-raised py-0.5 pr-1 pl-2.5 text-sm text-on-surface">
              {p.name}
              <IconButton size="xs" label={`Remove ${p.name}`} onPress={p.remove} className="rounded-full hover:text-danger">
                <XIcon size={12} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {question.clear && (
        <button type="button" onClick={question.clear} className="mt-1.5 text-xs text-on-surface-subtle underline underline-offset-2 hover:text-on-surface">
          Clear
        </button>
      )}
    </Field>
  );
}

function Required() {
  return <span className="ml-1 text-danger">*</span>;
}

function QuestionField({ question }: { question: SignupQuestionModel }) {
  const label = (
    <>
      {question.prompt}
      {question.required && <Required />}
    </>
  );

  if (question.type === "boolean") {
    return (
      <div>
        <label className="flex cursor-pointer select-none items-center gap-2.5">
          <input type="checkbox" checked={question.value === "true"} onChange={(e) => question.set(e.target.checked ? "true" : "false")} className="size-4 cursor-pointer accent-accent" />
          <span className="text-sm text-on-surface-muted">{label}</span>
        </label>
        {question.hint && <p className="mt-1 pl-[1.625rem] text-xs text-on-surface-subtle">{question.hint}</p>}
      </div>
    );
  }
  if (question.type === "textarea") {
    return (
      <Field label={label} hint={question.hint}>
        <Textarea value={question.value} onChange={(e) => question.set(e.target.value)} rows={3} className="resize-none" />
      </Field>
    );
  }
  if (question.type === "select" || question.type === "multiselect") {
    return <ChoiceGroup question={question} label={label} />;
  }
  if (question.type === "member") {
    return <MemberPickField question={question} label={label} />;
  }
  return (
    <Field label={label} hint={question.hint}>
      <Input value={question.value} onChange={(e) => question.set(e.target.value)} />
    </Field>
  );
}

export function SignupForm({ slug }: { slug: string }) {
  const form = useSignupForm(slug);
  const { rsn, timezone, ca, withdraw } = form;

  if (form.status === "loading") return null;

  if (form.block?.reason === "unavailable") {
    return (
      <EmptyState icon={<AlertIcon size={20} />} title="Signups temporarily unavailable">
        {form.block.message}
      </EmptyState>
    );
  }

  if (form.block?.reason === "notInGuild") {
    return (
      <EmptyState icon={<LockIcon size={20} />} title="Not in the clan's Discord">
        Your Discord account isn't in the Tectonic Discord server, so you can't sign up. Join the server, then log out and back in.
      </EmptyState>
    );
  }

  if (form.block?.reason === "notMember") {
    return (
      <EmptyState icon={<LockIcon size={20} />} title="Clan members only">
        You're in the Discord server, but the clan bot doesn't have you registered as a member. Ask a moderator to check your clan registration.
      </EmptyState>
    );
  }

  const rsnLabel = (
    <>
      RuneScape name
      <Required />
    </>
  );

  return (
    <div className="space-y-6">
      {/* Collapsed by default once already signed up — the title/description alone (visible either way) already
          says who's signed up as what; open by default beforehand, since there's nothing to collapse *to* yet.
          Controlled only so submitting can fold it away (see useSignupForm); withdrawing leaves it as it is. */}
      <Disclosure
        isExpanded={form.expanded}
        onExpandedChange={form.setExpanded}
        className="mx-auto max-w-lg"
        title={
          <h2 className="text-sm font-semibold text-on-surface" style={HEADING_FONT}>
            {/* A duo bingo's two steps are numbered: this, then picking a partner (PartnerPanel). */}
            {form.isDuo && "1. "}
            {form.signedUp ? "Edit your signup" : "Sign up"}
          </h2>
        }
        description={
          form.signedUp
            ? `${form.saved ? "Saved. " : ""}${form.teamLead ?? "You can update your answers or withdraw while signups are open."}`
            : "Fill this out to join the bingo."
        }
      >
        <div className="space-y-5">
          {form.atRisk && (
            <Notice tone="warn" icon={<AlertIcon />}>
              {form.atRisk.reason === "pairs_only"
                ? "Only pairs are drafted in this bingo, so you'll be left out of the draft unless you pair up with someone."
                : "Every team drafts the same number of players, and you're among the newest signups that don't split evenly across the teams right now. You'll be left out of the draft unless more players sign up or another team is added."}
            </Notice>
          )}
          {rsn.options ? (
            <Field
              label={rsnLabel}
              hint={
                rsn.verified ? (
                  <span className="inline-flex items-center gap-1 text-ok">
                    <CheckIcon size={12} /> Verified against your linked clan account
                  </span>
                ) : (
                  <span className="text-warn">This RSN isn't currently linked to your clan account</span>
                )
              }
            >
              <Select value={rsn.value} onChange={rsn.set} options={rsn.options.map((name) => ({ value: name, label: name }))} />
            </Field>
          ) : (
            <Field label={rsnLabel}>
              <Input value={rsn.value} onChange={(e) => rsn.set(e.target.value)} maxLength={12} />
            </Field>
          )}

          <Field
            label={
              <>
                Timezone
                <Required />
              </>
            }
            hint={timezone.fromBrowser ? "Filled in from your browser. Change it if that's not where you'll be playing from." : "Search by city, region or UTC offset."}
          >
            <SearchableSelect value={timezone.value} options={timezone.options} placeholder="Search for your timezone…" onChange={timezone.set} />
          </Field>

          {form.questions.map((q) => (
            <QuestionField key={q.id} question={q} />
          ))}

          {ca && (
            <div className={ca.peak ? "grid grid-cols-2 gap-4" : undefined}>
              <Field label="Current CA" hint={ca.current.loading ? "Looking up RuneProfile…" : ca.current.title}>
                <Input value={ca.current.loading ? "Looking up…" : ca.current.tier} readOnly disabled />
              </Field>
              {ca.peak && (
                <Field label="Peak CA" hint={!ca.peak.loading && ca.peak.found ? ca.peak.title : undefined}>
                  <Input value={ca.peak.loading ? "Looking up…" : ca.peak.tier} readOnly disabled />
                </Field>
              )}
            </div>
          )}

          {form.error && <Notice tone="danger">{form.error}</Notice>}
          {form.saved && <Notice tone="ok">Saved.</Notice>}

          <div className="flex gap-3">
            <Button variant="primary" className="flex-1" onPress={form.submit} isDisabled={!form.isValid || form.pending}>
              {form.pending ? "Saving…" : form.signedUp ? "Save changes" : "Sign up"}
            </Button>
            {form.signedUp && !withdraw.confirming && !form.teamLead && (
              <Button variant="danger" onPress={withdraw.ask}>
                Withdraw
              </Button>
            )}
          </div>

          {withdraw.confirming && (
            <Notice tone="danger">
              <div className="flex items-center gap-3">
                <span className="flex-1">Withdraw your signup?</span>
                <Button size="sm" variant="ghost" onPress={withdraw.cancel}>
                  Cancel
                </Button>
                <Button size="sm" variant="danger" onPress={withdraw.confirm} isDisabled={withdraw.pending}>
                  Confirm
                </Button>
              </div>
            </Notice>
          )}
        </div>
      </Disclosure>

      {form.isDuo && form.signedUp && <PartnerPanel slug={slug} />}
    </div>
  );
}

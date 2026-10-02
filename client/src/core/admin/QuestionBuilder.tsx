import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FeedbackAudience, QuestionForm, QuestionVisibility, SignupQuestion, SignupQuestionType } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { adminQueryKeys, useQuestions } from "../../api/adminQueries";
import { Button, IconButton } from "../ui/Button";
import { Card, EmptyState, Notice } from "../ui/Card";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Input } from "../ui/Field";
import { Checkbox } from "../ui/Checkbox";
import { Select } from "../ui/Select";
import { MAX_MEMBER_PICKS, MAX_QUESTION_HELPER_TEXT } from "@bingo/shared";
import { ChevronDownIcon, ChevronUpIcon, ListIcon, XIcon } from "../ui/icons";

const isChoice = (type: SignupQuestionType) => type === "select" || type === "multiselect";

const TYPES: { value: SignupQuestionType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Single choice" },
  { value: "multiselect", label: "Multiple choice" },
  { value: "boolean", label: "Yes / No" },
  { value: "member", label: "Member pick" },
];

function parseOptions(optionsJson: string | null | undefined): string {
  try {
    return JSON.parse(optionsJson ?? "[]").join(", ");
  } catch {
    return "";
  }
}

// Who besides the player sees the answers: that level and up. Captains (the default) is everyone who sees answers
// at all; narrow it for anything sensitive.
const VISIBILITIES: { value: QuestionVisibility; label: string }[] = [
  { value: "captains", label: "Captains" },
  { value: "mods", label: "Mods" },
  { value: "admins", label: "Admins" },
];

function VisibilitySelect(props: { value: QuestionVisibility; onChange: (v: QuestionVisibility) => void; "aria-label": string }) {
  return (
    <div className="shrink-0">
      <label className="flex items-center gap-1.5 text-xs text-on-surface-muted">
        Visible to
        <Select aria-label={props["aria-label"]} value={props.value} onChange={(v) => props.onChange(v as QuestionVisibility)} size="sm" className="w-auto!" options={VISIBILITIES} />
      </label>
      <p className="mt-0.5 text-xs text-on-surface-subtle">This role and up, and the player</p>
    </div>
  );
}

// Feedback questions only: who answers. Captains only questions are answered as a separate Captain response, which the
// form tells the Captain may be recognisable.
const AUDIENCES: { value: FeedbackAudience; label: string }[] = [
  { value: "all", label: "All Players" },
  { value: "captains", label: "Captains only" },
];

function AudienceSelect(props: { value: FeedbackAudience; onChange: (v: FeedbackAudience) => void; "aria-label": string }) {
  return (
    <div className="shrink-0">
      <label className="flex items-center gap-1.5 text-xs text-on-surface-muted">
        Asked of
        <Select aria-label={props["aria-label"]} value={props.value} onChange={(v) => props.onChange(v as FeedbackAudience)} size="sm" className="w-auto!" options={AUDIENCES} />
      </label>
      <p className="mt-0.5 text-xs text-on-surface-subtle">Moderators and Admins read every answer</p>
    </div>
  );
}

// Choice questions only: an extra Other choice where players write their own answer.
function AllowOtherCheckbox(props: { checked: boolean; onChange: (on: boolean) => void; "aria-label": string }) {
  return (
    <Checkbox size="xs" muted aria-label={props["aria-label"]} checked={props.checked} onChange={props.onChange} hint="Players can write their own answer" className="max-w-40 shrink-0 pt-2">
      Allow Other
    </Checkbox>
  );
}

// Member pick only: one member or several, and with several an optional maximum (empty: no limit).
function MemberPickSettings(props: { multiple: boolean; max: number | null; onChange: (settings: { multiplePicks: boolean; maxPicks: number | null }) => void; label: string }) {
  const [maxText, setMaxText] = useState(props.max === null ? "" : String(props.max));
  const [seen, setSeen] = useState(props.max);
  if (seen !== props.max) {
    setSeen(props.max);
    setMaxText(props.max === null ? "" : String(props.max));
  }
  const commitMax = () => {
    const n = Number.parseInt(maxText, 10);
    const max = Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_MEMBER_PICKS) : null;
    setMaxText(max === null ? "" : String(max));
    if (max !== props.max) props.onChange({ multiplePicks: true, maxPicks: max });
  };
  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label={`${props.label} picks`}
        value={props.multiple ? "several" : "one"}
        onChange={(v) => props.onChange({ multiplePicks: v === "several", maxPicks: v === "several" ? props.max : null })}
        size="sm"
        className="w-auto!"
        options={[
          { value: "one", label: "One member" },
          { value: "several", label: "Several members" },
        ]}
      />
      {props.multiple && (
        <label className="flex items-center gap-1.5 text-xs text-on-surface-muted">
          At most
          <Input
            aria-label={`${props.label} maximum picks`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_MEMBER_PICKS}
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            onBlur={commitMax}
            onKeyDown={(e) => e.key === "Enter" && commitMax()}
            placeholder="No limit"
            size="sm"
            className="w-24!"
          />
        </label>
      )}
    </div>
  );
}

function TypeSelect(props: { value: SignupQuestionType; onChange: (t: SignupQuestionType) => void; "aria-label": string }) {
  return (
    <Select aria-label={props["aria-label"]} value={props.value} onChange={(t) => props.onChange(t as SignupQuestionType)} className="w-auto! shrink-0" options={TYPES} />
  );
}

/**
 * The question builder of the signup form, or (`form` "feedback") of the Feedback form (CONTEXT.md "Feedback question"):
 * the same settings, but a Feedback question has an audience instead of a visibility, and its questions can be edited
 * in any stage.
 */
export function QuestionBuilder({ slug, form = "signup" }: { slug: string; form?: QuestionForm }) {
  const feedback = form === "feedback";
  const { data } = useQuestions(slug, form);
  const questions = data?.questions ?? [];
  const answerCounts = data?.answerCounts ?? {};
  const queryClient = useQueryClient();
  const [newPrompt, setNewPrompt] = useState("");
  const [newType, setNewType] = useState<SignupQuestionType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [newHelper, setNewHelper] = useState("");
  const [newRequired, setNewRequired] = useState(false);
  const [newAllowOther, setNewAllowOther] = useState(false);
  const [newPicks, setNewPicks] = useState<{ multiplePicks: boolean; maxPicks: number | null }>({ multiplePicks: false, maxPicks: null });
  const [newVisibility, setNewVisibility] = useState<QuestionVisibility>("captains");
  const [newAudience, setNewAudience] = useState<FeedbackAudience>("all");
  const [error, setError] = useState<string | null>(null);
  // The question waiting on "delete it and its answers?" — only asked when players have answered it.
  const [confirmingDelete, setConfirmingDelete] = useState<SignupQuestion | null>(null);

  const queryKey = adminQueryKeys.questions(slug, form);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  async function add() {
    if (!newPrompt.trim()) return;
    setError(null);
    const options = newOptions.split(",").map((s) => s.trim()).filter(Boolean);
    if (isChoice(newType) && options.length === 0) {
      setError("Add at least one option for a choice question");
      return;
    }
    try {
      await adminApi.createQuestion(slug, {
        prompt: newPrompt.trim(),
        helperText: newHelper.trim() || undefined,
        required: newRequired,
        type: newType,
        sortOrder: questions.length,
        optionsJson: isChoice(newType) ? JSON.stringify(options) : undefined,
        allowOther: isChoice(newType) && newAllowOther,
        ...(newType === "member" ? newPicks : {}),
        ...(feedback ? { form, audience: newAudience } : { visibility: newVisibility }),
      });
      setNewPrompt("");
      setNewOptions("");
      setNewHelper("");
      setNewRequired(false);
      setNewAllowOther(false);
      setNewPicks({ multiplePicks: false, maxPicks: null });
      setNewVisibility("captains");
      setNewAudience("all");
      invalidate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add question");
    }
  }
  async function patch(id: string, fields: Partial<SignupQuestion>) {
    await adminApi.updateQuestion(slug, id, fields);
    invalidate();
  }
  function remove(id: string) {
    return optimisticUpdate<{ questions: SignupQuestion[]; answerCounts: Record<string, number> }>(
      queryClient,
      queryKey,
      (d) => ({ ...d, questions: d.questions.filter((q) => q.id !== id) }),
      () => adminApi.deleteQuestion(slug, id),
    );
  }
  function requestRemove(q: SignupQuestion) {
    if (answerCounts[q.id]) setConfirmingDelete(q);
    else void remove(q.id);
  }
  function move(index: number, dir: -1 | 1) {
    const reordered = [...questions];
    const [item] = reordered.splice(index, 1);
    reordered.splice(index + dir, 0, item);
    return optimisticUpdate<{ questions: SignupQuestion[]; answerCounts: Record<string, number> }>(
      queryClient,
      queryKey,
      (d) => ({ ...d, questions: reordered }),
      () => adminApi.reorderQuestions(slug, reordered.map((q) => q.id), form),
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {questions.length === 0 ? (
        <EmptyState icon={<ListIcon />} title={feedback ? "No feedback questions" : "No signup questions"}>
          {feedback ? "Players see no Feedback form once the Bingo is Finished. Add questions below to ask them how it went." : "Players only enter their RSN. Add questions below if you need more from them."}
        </EmptyState>
      ) : (
        <div role="list" aria-label={feedback ? "Feedback questions" : "Signup questions"} className="space-y-2">
          {questions.map((q, i) => (
            <Card key={q.id} role="listitem" className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 flex-col">
                  <IconButton label="Move up" size="sm" isDisabled={i === 0} onPress={() => move(i, -1)} className="size-5">
                    <ChevronUpIcon size={12} />
                  </IconButton>
                  <IconButton label="Move down" size="sm" isDisabled={i === questions.length - 1} onPress={() => move(i, 1)} className="size-5">
                    <ChevronDownIcon size={12} />
                  </IconButton>
                </div>
                <Input aria-label="Question prompt" defaultValue={q.prompt} onBlur={(e) => patch(q.id, { prompt: e.target.value })} className="min-w-0 flex-1" />
                <TypeSelect aria-label="Question type" value={q.type} onChange={(type) => patch(q.id, { type })} />
                <Checkbox size="xs" muted checked={q.required} onChange={(required) => patch(q.id, { required })} className="h-8 shrink-0">
                  Required
                </Checkbox>
                <IconButton label="Delete question" size="sm" onPress={() => requestRemove(q)} className="hover:text-danger">
                  <XIcon size={12} />
                </IconButton>
              </div>
              <div className="flex items-start gap-2">
                <Input
                  aria-label="Helper text"
                  defaultValue={q.helperText ?? ""}
                  onBlur={(e) => e.target.value.trim() !== (q.helperText ?? "") && patch(q.id, { helperText: e.target.value })}
                  maxLength={MAX_QUESTION_HELPER_TEXT}
                  placeholder="Helper text shown under the question (optional)"
                  size="sm"
                  className="min-w-0 flex-1"
                />
                {feedback ? (
                  <AudienceSelect aria-label="Question asked of" value={q.audience} onChange={(audience) => patch(q.id, { audience })} />
                ) : (
                  <VisibilitySelect aria-label="Answers visible to" value={q.visibility} onChange={(visibility) => patch(q.id, { visibility })} />
                )}
              </div>
              {isChoice(q.type) && (
                <div className="flex items-start gap-2">
                  <Input
                    aria-label="Choice options"
                    defaultValue={parseOptions(q.optionsJson)}
                    onBlur={(e) => patch(q.id, { optionsJson: JSON.stringify(e.target.value.split(",").map((s) => s.trim()).filter(Boolean)) })}
                    placeholder="Comma-separated options"
                    size="sm"
                    className="min-w-0 flex-1"
                  />
                  <AllowOtherCheckbox aria-label="Allow Other" checked={q.allowOther} onChange={(allowOther) => patch(q.id, { allowOther })} />
                </div>
              )}
              {q.type === "member" && <MemberPickSettings label="Member pick" multiple={q.multiplePicks} max={q.maxPicks} onChange={(settings) => patch(q.id, settings)} />}
            </Card>
          ))}
        </div>
      )}

      <Card className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Input
            aria-label="New question"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isChoice(newType) && add()}
            placeholder="New question…"
            className="min-w-0 flex-1"
          />
          <TypeSelect aria-label="New question type" value={newType} onChange={setNewType} />
          <Checkbox size="xs" muted aria-label="New question required" checked={newRequired} onChange={setNewRequired} className="h-8 shrink-0">
            Required
          </Checkbox>
          <Button onPress={add} isDisabled={!newPrompt.trim()} className="shrink-0">
            Add
          </Button>
        </div>
        <div className="flex items-start gap-2">
          <Input
            aria-label="New question helper text"
            value={newHelper}
            onChange={(e) => setNewHelper(e.target.value)}
            maxLength={MAX_QUESTION_HELPER_TEXT}
            placeholder="Helper text shown under the question (optional)"
            size="sm"
            className="min-w-0 flex-1"
          />
          {feedback ? (
            <AudienceSelect aria-label="New question asked of" value={newAudience} onChange={setNewAudience} />
          ) : (
            <VisibilitySelect aria-label="New question answers visible to" value={newVisibility} onChange={setNewVisibility} />
          )}
        </div>
        {isChoice(newType) && (
          <div className="flex items-start gap-2">
            <Input
              aria-label="Choice options"
              value={newOptions}
              onChange={(e) => setNewOptions(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Comma-separated options"
              size="sm"
              className="min-w-0 flex-1"
            />
            <AllowOtherCheckbox aria-label="New question allows Other" checked={newAllowOther} onChange={setNewAllowOther} />
          </div>
        )}
        {newType === "member" && <MemberPickSettings label="New question" multiple={newPicks.multiplePicks} max={newPicks.maxPicks} onChange={setNewPicks} />}
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      <DeleteQuestionDialog
        feedback={feedback}
        question={confirmingDelete}
        answerCount={confirmingDelete ? (answerCounts[confirmingDelete.id] ?? 0) : 0}
        onClose={() => setConfirmingDelete(null)}
        onConfirm={(id) => {
          setConfirmingDelete(null);
          void remove(id);
        }}
      />
    </div>
  );
}

function DeleteQuestionDialog({
  feedback,
  question,
  answerCount,
  onClose,
  onConfirm,
}: {
  feedback: boolean;
  question: SignupQuestion | null;
  answerCount: number;
  onClose: () => void;
  onConfirm: (id: string) => void;
}) {
  // What's shown stays put while the dialog animates closed, rather than blanking out as `question` goes null.
  const shown = useRef({ question, answerCount });
  if (question) shown.current = { question, answerCount };
  const { question: q, answerCount: n } = shown.current;
  return (
    <Dialog isOpen={question !== null} onClose={onClose}>
      <DialogHeader title="Delete this question?" onClose={onClose} />
      <div className="space-y-4 p-5 text-sm text-on-surface-muted">
        <p>
          <span className="font-medium text-on-surface">“{q?.prompt}”</span> has <span className="num text-on-surface">{n}</span> answer{n === 1 ? "" : "s"} from
          players. Deleting the question deletes {n === 1 ? "that answer" : "those answers"} too, and it can't be undone.
        </p>
        {!feedback && <p>To keep a copy, use Copy as CSV on the Signups tab first.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onPress={() => question && onConfirm(question.id)}>
            Delete question and answers
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

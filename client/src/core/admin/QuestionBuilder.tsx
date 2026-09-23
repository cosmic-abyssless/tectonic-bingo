import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SignupQuestion, SignupQuestionType } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { optimisticUpdate } from "../../api/optimistic";
import { adminQueryKeys, useQuestions } from "../../api/adminQueries";
import { Button, IconButton } from "../ui/Button";
import { Card, EmptyState, Notice } from "../ui/Card";
import { Dialog, DialogHeader } from "../ui/Dialog";
import { Input, Select } from "../ui/Field";
import { MAX_QUESTION_HELPER_TEXT } from "@bingo/shared";
import { ChevronDownIcon, ChevronUpIcon, ListIcon, XIcon } from "../ui/icons";

const isChoice = (type: SignupQuestionType) => type === "select" || type === "multiselect";

const TYPES: { value: SignupQuestionType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Single choice" },
  { value: "multiselect", label: "Multiple choice" },
  { value: "boolean", label: "Yes / No" },
];

function parseOptions(optionsJson: string | null | undefined): string {
  try {
    return JSON.parse(optionsJson ?? "[]").join(", ");
  } catch {
    return "";
  }
}

function TypeSelect(props: { value: SignupQuestionType; onChange: (t: SignupQuestionType) => void; "aria-label": string }) {
  return (
    <Select aria-label={props["aria-label"]} value={props.value} onChange={(e) => props.onChange(e.target.value as SignupQuestionType)} className="w-auto! shrink-0">
      {TYPES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </Select>
  );
}

export function QuestionBuilder({ slug }: { slug: string }) {
  const { data } = useQuestions(slug);
  const questions = data?.questions ?? [];
  const answerCounts = data?.answerCounts ?? {};
  const queryClient = useQueryClient();
  const [newPrompt, setNewPrompt] = useState("");
  const [newType, setNewType] = useState<SignupQuestionType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [newHelper, setNewHelper] = useState("");
  const [newRequired, setNewRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The question waiting on "delete it and its answers?" — only asked when players have answered it.
  const [confirmingDelete, setConfirmingDelete] = useState<SignupQuestion | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.questions(slug) });

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
      });
      setNewPrompt("");
      setNewOptions("");
      setNewHelper("");
      setNewRequired(false);
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
      adminQueryKeys.questions(slug),
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
      adminQueryKeys.questions(slug),
      (d) => ({ ...d, questions: reordered }),
      () => adminApi.reorderQuestions(slug, reordered.map((q) => q.id)),
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {questions.length === 0 ? (
        <EmptyState icon={<ListIcon />} title="No signup questions">
          Players only enter their RSN. Add questions below if you need more from them.
        </EmptyState>
      ) : (
        <div role="list" aria-label="Signup questions" className="space-y-2">
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
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-on-surface-muted">
                  <input type="checkbox" checked={q.required} onChange={(e) => patch(q.id, { required: e.target.checked })} className="size-4 accent-accent" />
                  Required
                </label>
                <IconButton label="Delete question" size="sm" onPress={() => requestRemove(q)} className="hover:text-danger">
                  <XIcon size={12} />
                </IconButton>
              </div>
              <Input
                aria-label="Helper text"
                defaultValue={q.helperText ?? ""}
                onBlur={(e) => e.target.value.trim() !== (q.helperText ?? "") && patch(q.id, { helperText: e.target.value })}
                maxLength={MAX_QUESTION_HELPER_TEXT}
                placeholder="Helper text shown under the question (optional)"
                size="sm"
              />
              {isChoice(q.type) && (
                <Input
                  aria-label="Choice options"
                  defaultValue={parseOptions(q.optionsJson)}
                  onBlur={(e) => patch(q.id, { optionsJson: JSON.stringify(e.target.value.split(",").map((s) => s.trim()).filter(Boolean)) })}
                  placeholder="Comma-separated options"
                  size="sm"
                />
              )}
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
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-on-surface-muted">
            <input type="checkbox" aria-label="New question required" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} className="size-4 accent-accent" />
            Required
          </label>
          <Button onPress={add} isDisabled={!newPrompt.trim()} className="shrink-0">
            Add
          </Button>
        </div>
        <Input
          aria-label="New question helper text"
          value={newHelper}
          onChange={(e) => setNewHelper(e.target.value)}
          maxLength={MAX_QUESTION_HELPER_TEXT}
          placeholder="Helper text shown under the question (optional)"
          size="sm"
        />
        {isChoice(newType) && (
          <Input
            aria-label="Choice options"
            value={newOptions}
            onChange={(e) => setNewOptions(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Comma-separated options"
            size="sm"
          />
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      <DeleteQuestionDialog
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
  question,
  answerCount,
  onClose,
  onConfirm,
}: {
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
        <p>To keep a copy, use Copy as CSV on the Signups tab first.</p>
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

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SignupQuestion, SignupQuestionType } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useQuestions } from "../../api/adminQueries";

const TYPES: { value: SignupQuestionType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "boolean", label: "Yes / No" },
];

export function QuestionBuilder({ slug }: { slug: string }) {
  const { data } = useQuestions(slug);
  const questions = data?.questions ?? [];
  const queryClient = useQueryClient();
  const [newPrompt, setNewPrompt] = useState("");
  const [newType, setNewType] = useState<SignupQuestionType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.questions(slug) });

  async function add() {
    if (!newPrompt.trim()) return;
    setError(null);
    const options = newOptions.split(",").map((s) => s.trim()).filter(Boolean);
    if (newType === "select" && options.length === 0) {
      setError("Add at least one option for a dropdown question");
      return;
    }
    try {
      await adminApi.createQuestion(slug, {
        prompt: newPrompt.trim(),
        type: newType,
        sortOrder: questions.length,
        optionsJson: newType === "select" ? JSON.stringify(options) : undefined,
      });
      setNewPrompt("");
      setNewOptions("");
      invalidate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add question");
    }
  }
  async function patch(id: string, fields: Partial<SignupQuestion>) {
    await adminApi.updateQuestion(slug, id, fields);
    invalidate();
  }
  async function remove(id: string) {
    await adminApi.deleteQuestion(slug, id);
    invalidate();
  }
  async function move(index: number, dir: -1 | 1) {
    const reordered = [...questions];
    const [item] = reordered.splice(index, 1);
    reordered.splice(index + dir, 0, item);
    await adminApi.reorderQuestions(slug, reordered.map((q) => q.id));
    invalidate();
  }

  return (
    <div className="max-w-2xl space-y-3">
      {questions.map((q, i) => (
        <div key={q.id} className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex flex-col gap-0.5 pt-1">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-white disabled:opacity-20 text-xs cursor-pointer leading-none">
                ▲
              </button>
              <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="text-slate-500 hover:text-white disabled:opacity-20 text-xs cursor-pointer leading-none">
                ▼
              </button>
            </div>
            <input
              defaultValue={q.prompt}
              onBlur={(e) => patch(q.id, { prompt: e.target.value })}
              className="flex-1 bg-slate-800 border border-slate-600 text-white rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
            />
            <select value={q.type} onChange={(e) => patch(q.id, { type: e.target.value as SignupQuestionType })} className="bg-slate-800 border border-slate-600 text-slate-300 text-xs rounded px-2 py-1.5 focus:outline-none">
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0 cursor-pointer">
              <input type="checkbox" checked={q.required} onChange={(e) => patch(q.id, { required: e.target.checked })} className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer" />
              Required
            </label>
            <button onClick={() => remove(q.id)} className="text-slate-500 hover:text-red-400 text-xs cursor-pointer shrink-0">
              ✕
            </button>
          </div>
          {q.type === "select" && (
            <input
              defaultValue={(() => {
                try {
                  return JSON.parse(q.optionsJson ?? "[]").join(", ");
                } catch {
                  return "";
                }
              })()}
              onBlur={(e) =>
                patch(q.id, { optionsJson: JSON.stringify(e.target.value.split(",").map((s) => s.trim()).filter(Boolean)) })
              }
              placeholder="Comma-separated options"
              className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
            />
          )}
        </div>
      ))}

      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newType !== "select" && add()}
            placeholder="New question…"
            className="flex-1 bg-slate-800 border border-slate-600 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
          />
          <select aria-label="New question type" value={newType} onChange={(e) => setNewType(e.target.value as SignupQuestionType)} className="bg-slate-800 border border-slate-600 text-slate-300 text-sm rounded-md px-2 py-2 focus:outline-none">
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button onClick={add} className="text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-md px-4 py-2 transition-colors cursor-pointer shrink-0">
            Add
          </button>
        </div>
        {newType === "select" && (
          <input
            value={newOptions}
            onChange={(e) => setNewOptions(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Comma-separated options"
            className="w-full bg-slate-800 border border-slate-600 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
          />
        )}
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    </div>
  );
}

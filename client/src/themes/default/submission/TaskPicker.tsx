import type { SubmissionFlowModel } from "../../../headless/types";
import { Field } from "../../../core/ui/Field";
import { Notice } from "../../../core/ui/Card";
import { CheckIcon } from "../../../core/ui/icons";

export function TaskPicker({ task }: { task: SubmissionFlowModel["task"] }) {
  return (
    <>
      {task.options.length > 1 && (
        <Field label="Task" as="div">
          <div className="flex overflow-hidden rounded-md border border-line-strong">
            {task.options.map((option, i) => (
              <button
                key={option.id}
                type="button"
                onClick={() => task.select(option.id)}
                className={`h-10 flex-1 text-sm font-medium transition-colors ${i > 0 ? "border-l border-line-strong" : ""} ${
                  task.selectedId === option.id ? "bg-accent text-accent-fg" : "bg-bg text-fg-muted hover:text-fg"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {task.autoSelected && task.current && (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <CheckIcon className="text-ok" />
          Submitting for {task.current.label}
        </p>
      )}

      {task.current?.isManual && <Notice tone="info">This task is judged manually by a mod — just submit your screenshot as proof.</Notice>}
    </>
  );
}

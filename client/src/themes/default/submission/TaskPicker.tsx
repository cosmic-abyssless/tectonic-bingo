import type { SubmissionFlowModel } from "../../../headless/types";
import { Field } from "../../../core/ui/Field";
import { Notice } from "../../../core/ui/Card";
import { CheckIcon } from "../../../core/ui/icons";
import { SegmentedControl } from "../../../core/ui/SegmentedControl";

export function TaskPicker({ task }: { task: SubmissionFlowModel["task"] }) {
  return (
    <>
      {task.options.length > 1 && (
        <Field label="Task" as="div" tutorial="submit-tile">
          <SegmentedControl fill aria-label="Task" options={task.options} value={task.selectedId} onChange={task.select} />
        </Field>
      )}

      {task.autoSelected && task.current && (
        <p className="flex items-center gap-2 text-sm text-on-surface-muted">
          <CheckIcon className="text-ok" />
          Submitting for {task.current.label}
        </p>
      )}

      {task.current?.isManual && <Notice tone="info">This task is judged manually by a mod — just submit your screenshot as proof.</Notice>}
    </>
  );
}

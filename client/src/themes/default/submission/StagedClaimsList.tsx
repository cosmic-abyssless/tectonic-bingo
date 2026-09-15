import type { SubmissionFlowModel } from "../../../headless/types";
import { Field } from "../../../core/ui/Field";
import { Button, IconButton } from "../../../core/ui/Button";
import { PlusIcon, XIcon } from "../../../core/ui/icons";

export function StagedClaimsList({ staged }: { staged: SubmissionFlowModel["staged"] }) {
  return (
    <>
      {staged.items.length > 0 && (
        <Field label="Also in this screenshot" as="div">
          <ul className="divide-y divide-outline rounded-md border border-outline">
            {staged.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-on-surface">
                <span>{item.label}</span>
                <IconButton label={`Remove ${item.label}`} size="sm" onPress={() => staged.remove(i)}>
                  <XIcon />
                </IconButton>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {staged.canStageCurrent && (
        <Button variant="ghost" size="sm" onPress={staged.stageCurrent}>
          <PlusIcon />
          Add another item from this screenshot
        </Button>
      )}
    </>
  );
}

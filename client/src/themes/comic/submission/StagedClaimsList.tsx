import type { SubmissionFlowModel } from "../../../headless/types";
import { PlusIcon, XIcon } from "../../../core/ui/icons";
import { ComicButton, ComicIconButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { ComicField } from "./ComicField";

/** Extra claims riding along on the same screenshot. */
export function StagedClaimsList({ staged }: { staged: SubmissionFlowModel["staged"] }) {
  const { colors } = useComic();
  return (
    <>
      {staged.items.length > 0 && (
        <ComicField label="Also in this screenshot" as="div">
          <ul className="border-[3px]" style={{ borderColor: colors.INK, background: colors.PAPER_RAISED, boxShadow: `3px 3px 0 ${colors.INK}` }}>
            {staged.items.map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                style={{ color: colors.INK, borderTop: i > 0 ? `2px dashed ${colors.RULE}` : undefined }}
              >
                <span className="truncate">{item.label}</span>
                <ComicIconButton label={`Remove ${item.label}`} onPress={() => staged.remove(i)} className="size-7">
                  <XIcon size={14} />
                </ComicIconButton>
              </li>
            ))}
          </ul>
        </ComicField>
      )}

      {staged.canStageCurrent && (
        <ComicButton variant="ghost" size="sm" onPress={staged.stageCurrent} className="underline decoration-[3px] underline-offset-4">
          <PlusIcon />
          Add another item from this photo
        </ComicButton>
      )}
    </>
  );
}

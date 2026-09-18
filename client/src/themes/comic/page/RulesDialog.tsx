import { Markdown } from "../../../core/ui/Markdown";
import { ComicDialog, ComicDialogHeader } from "../ui/ComicDialog";
import { CaptionBox } from "../ui/CaptionBox";

/** The fine print, printed on the inside back cover. */
export function RulesDialog({ isOpen, markdown, onClose }: { isOpen: boolean; markdown: string; onClose: () => void }) {
  return (
    <ComicDialog isOpen={isOpen && !!markdown} onClose={onClose} size="lg">
      <ComicDialogHeader title="The Rules" subtitle="Read before you play, true believer." tone="blue" onClose={onClose} />
      <div className="p-5">
        <CaptionBox tone="paper" tilt={-0.3} className="px-5 py-4">
          <Markdown>{markdown}</Markdown>
        </CaptionBox>
      </div>
    </ComicDialog>
  );
}

import { Dialog, DialogHeader } from "../../../core/ui/Dialog";
import { Markdown } from "../../../core/ui/Markdown";

export function RulesDialog({ isOpen, markdown, onClose }: { isOpen: boolean; markdown: string; onClose: () => void }) {
  return (
    <Dialog isOpen={isOpen && !!markdown} onClose={onClose} size="lg">
      <DialogHeader title="Rules" onClose={onClose} />
      <div className="px-5 pb-5">
        <Markdown>{markdown}</Markdown>
      </div>
    </Dialog>
  );
}

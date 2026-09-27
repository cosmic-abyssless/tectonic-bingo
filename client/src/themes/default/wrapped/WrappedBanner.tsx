import { Button } from "../../../core/ui/Button";
import { ArrowRightIcon } from "../../../core/ui/icons";

/** The Board's "Your Bingo Wrapped" banner. */
export function WrappedBanner({ preview, onOpen }: { preview: boolean; onOpen: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-strong bg-surface p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-muted">{preview ? "Wrapped preview" : "It's here"}</p>
        <p className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Your Bingo Wrapped</p>
        {preview && <p className="mt-1 text-sm text-on-surface-muted">Only Moderators can see it until it's published.</p>}
      </div>
      <Button variant="primary" onPress={onOpen}>
        {preview ? "Preview Wrapped" : "Open Wrapped"}
        <ArrowRightIcon />
      </Button>
    </div>
  );
}

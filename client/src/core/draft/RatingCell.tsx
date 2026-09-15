import { useState } from "react";
import { Dialog as AriaDialog, DialogTrigger, Popover } from "react-aria-components";
import { MAX_RATING_STARS, type PickRating } from "@bingo/shared";
import { Button, IconButton } from "../ui/Button";
import { Textarea } from "../ui/Field";
import { NoteIcon, StarIcon } from "../ui/icons";

const EMPTY_RATING: PickRating = { stars: 0, note: "" };

/**
 * A team lead's private rating of one signup: 0-3 stars plus a short note
 * behind a popover. Clicking the current star count clears it.
 */
export function RatingCell({ rating = EMPTY_RATING, onChange }: { rating?: PickRating; onChange: (rating: PickRating) => void }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex" role="radiogroup" aria-label="Rating">
        {Array.from({ length: MAX_RATING_STARS }, (_, i) => i + 1).map((n) => {
          const lit = n <= rating.stars;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === rating.stars}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => onChange({ ...rating, stars: n === rating.stars ? 0 : n })}
              className={`flex size-6 items-center justify-center rounded-sm transition-colors hover:text-warn ${lit ? "text-warn" : "text-fg-subtle"}`}
            >
              <StarIcon size={14} fill={lit ? "currentColor" : "none"} />
            </button>
          );
        })}
      </div>
      <NotePopover note={rating.note} onSave={(note) => onChange({ ...rating, note })} />
    </div>
  );
}

function NotePopover({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const [draft, setDraft] = useState(note);
  return (
    <DialogTrigger onOpenChange={(open) => open && setDraft(note)}>
      <IconButton label={note ? `Note: ${note}` : "Add note"} size="sm" className={note ? "text-fg" : "text-fg-subtle"}>
        <NoteIcon size={14} fill={note ? "currentColor" : "none"} fillOpacity={0.25} />
      </IconButton>
      <Popover placement="bottom end" offset={6} className="overlay-panel w-64 rounded-md border border-line bg-surface-raised p-3 shadow-pop outline-none">
        <AriaDialog aria-label="Pick note" className="space-y-2 outline-none">
          {({ close }) => (
            <>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={200} placeholder="Why this pick?" autoFocus />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onPress={close}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onPress={() => {
                    onSave(draft);
                    close();
                  }}
                >
                  Save
                </Button>
              </div>
            </>
          )}
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}

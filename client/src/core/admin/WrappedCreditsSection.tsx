import { useRef } from "react";
import { MAX_WRAPPED_CREDITS, MAX_WRAPPED_CREDIT_LENGTH, type WrappedCredit } from "@bingo/shared";
import { Button, IconButton } from "../ui/Button";
import { Input } from "../ui/Field";
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from "../ui/icons";

/**
 * Credits (CONTEXT.md): who put the Bingo together, a name and an optional role each, in order. Free text, not tied to
 * the Admin or Moderator roles. Edited in the settings form and saved with it; Wrapped's Outro lists them.
 */
export function WrappedCreditsSection({ credits, onChange }: { credits: WrappedCredit[]; onChange: (credits: WrappedCredit[]) => void }) {
  // Rows have no id of their own, so each keeps a local key through moves and removals (inputs keep focus).
  const nextKey = useRef(0);
  const keys = useRef<number[]>([]);
  while (keys.current.length < credits.length) keys.current.push(nextKey.current++);

  const update = (i: number, patch: Partial<WrappedCredit>) => onChange(credits.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => {
    keys.current.splice(i, 1);
    onChange(credits.filter((_, j) => j !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    const swap = <T,>(list: T[]) => {
      const next = [...list];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    };
    keys.current = swap(keys.current);
    onChange(swap(credits));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-on-surface-muted">
        The people who put this bingo together (board design, art, anything else), shown at the end of Wrapped in the order below. Anyone can go here:
        it isn't tied to who's an admin or a mod.
      </p>
      {credits.length > 0 && (
        <div role="list" aria-label="Credits" className="space-y-2">
          {credits.map((c, i) => (
            <div key={keys.current[i]} role="listitem" className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col">
                <IconButton label="Move up" size="sm" isDisabled={i === 0} onPress={() => move(i, -1)} className="size-5">
                  <ChevronUpIcon size={12} />
                </IconButton>
                <IconButton label="Move down" size="sm" isDisabled={i === credits.length - 1} onPress={() => move(i, 1)} className="size-5">
                  <ChevronDownIcon size={12} />
                </IconButton>
              </div>
              <Input aria-label="Name" placeholder="Name" value={c.name} maxLength={MAX_WRAPPED_CREDIT_LENGTH} onChange={(e) => update(i, { name: e.target.value })} className="min-w-0 flex-1" />
              <Input
                aria-label="Role"
                placeholder="Role (optional)"
                value={c.role ?? ""}
                maxLength={MAX_WRAPPED_CREDIT_LENGTH}
                onChange={(e) => update(i, { role: e.target.value || null })}
                className="min-w-0 flex-1"
              />
              <IconButton label="Remove from credits" size="sm" onPress={() => remove(i)} className="hover:text-danger">
                <XIcon size={12} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <Button onPress={() => onChange([...credits, { name: "", role: null }])} isDisabled={credits.length >= MAX_WRAPPED_CREDITS}>
        <PlusIcon />
        Add a name
      </Button>
    </div>
  );
}

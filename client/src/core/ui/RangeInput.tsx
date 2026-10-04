import { useRef, type InputHTMLAttributes } from "react";
import { useNativeChange } from "./useNativeChange";

type RangeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value: number;
  /** Every step of a drag: for what's on screen only, never a save. */
  onChange(value: number): void;
  /** Once per drag, or per press of the arrow keys however long it's held, when it ends on a new value: where a save goes. */
  onCommit?(value: number): void;
};

/**
 * A slider. Like ColorInput, it never saves on every step: React's onChange is the browser's input event, which fires
 * on every step of a drag (docs/postmortems/2026-10-03-colour-picker.md). onChange moves what's on screen; onCommit is
 * the one that saves. A drag commits on the browser's own change event, when it ends (or on letting go of the pointer,
 * whichever comes first). The keys can't: the browser fires change on every arrow-key step, so a held key would save
 * ~30 times a second. They commit when let go of (or on leaving the slider).
 */
export function RangeInput({ value, onChange, onCommit, onPointerDown, onPointerUp, onKeyDown, onKeyUp, onBlur, ...props }: RangeInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  // The value last committed, or the one this drag or key press started from; null before the first.
  const committed = useRef<string | null>(null);
  // Whether arrow keys are down: their change events wait for the key to be let go of.
  const keying = useRef(false);

  const commit = (input: HTMLInputElement) => {
    if (input.value === committed.current) return;
    committed.current = input.value;
    onCommit?.(Number(input.value));
  };
  const endKeying = (input: HTMLInputElement) => {
    if (!keying.current) return;
    keying.current = false;
    commit(input);
  };
  useNativeChange(ref, (input) => {
    if (!keying.current) commit(input);
  });

  return (
    <input
      {...props}
      ref={ref}
      type="range"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerDown={(e) => {
        committed.current = e.currentTarget.value;
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        commit(e.currentTarget);
        onPointerUp?.(e);
      }}
      onKeyDown={(e) => {
        if (!keying.current) {
          keying.current = true;
          committed.current = e.currentTarget.value;
        }
        onKeyDown?.(e);
      }}
      onKeyUp={(e) => {
        endKeying(e.currentTarget);
        onKeyUp?.(e);
      }}
      onBlur={(e) => {
        endKeying(e.currentTarget);
        onBlur?.(e);
      }}
    />
  );
}

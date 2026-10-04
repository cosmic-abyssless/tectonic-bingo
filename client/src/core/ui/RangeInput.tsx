import { useEffect, useRef, type InputHTMLAttributes } from "react";

type RangeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value: number;
  /** Every step of a drag: for what's on screen only, never a save. */
  onChange(value: number): void;
  /** Once, when the drag ends on a new value: where a save goes. */
  onCommit?(value: number): void;
};

/**
 * A slider. Like ColorInput, it never saves on every step: React's onChange is the browser's input event, which fires
 * on every step of a drag (docs/postmortems/2026-10-03-colour-picker.md). onChange moves what's on screen; onCommit,
 * the browser's own change event when the drag ends, is the one that saves.
 */
export function RangeInput({ value, onChange, onCommit, ...props }: RangeInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef(onCommit);
  useEffect(() => {
    latest.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const commit = () => latest.current?.(Number(input.value));
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, []);

  return <input {...props} ref={ref} type="range" value={value} onChange={(e) => onChange(Number(e.target.value))} />;
}

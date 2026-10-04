import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { useNativeChange } from "./useNativeChange";

type ColorInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value: string;
  /** The colour picked, once the picker closes on a new one. */
  onCommit(hex: string): void;
};

/**
 * A colour input that saves once, when its picker closes. React's onChange is the browser's input event, which fires on
 * every step of a drag across the picker: saving from it sent a request per step (and, for a Team, a Discord sync each).
 * The swatch follows the drag; the browser's own change event, on closing, is the one that saves.
 */
export function ColorInput({ value, onCommit, ...props }: ColorInputProps) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  useNativeChange(ref, (input) => {
    if (input.value !== value) onCommit(input.value);
  });

  return <input {...props} ref={ref} type="color" value={draft} onChange={(e) => setDraft(e.target.value)} />;
}

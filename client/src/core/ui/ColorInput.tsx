import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

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
  const latest = useRef({ value, onCommit });
  useEffect(() => {
    latest.current = { value, onCommit };
    setDraft(value);
  }, [value, onCommit]);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const commit = () => {
      if (input.value !== latest.current.value) latest.current.onCommit(input.value);
    };
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, []);

  return <input {...props} ref={ref} type="color" value={draft} onChange={(e) => setDraft(e.target.value)} />;
}

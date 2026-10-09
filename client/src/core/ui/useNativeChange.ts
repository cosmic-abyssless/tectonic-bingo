import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onChange` on the browser's own change event, which React doesn't expose: React's onChange is the input event,
 * which a colour or range input fires on every step of a drag (docs/postmortems/2026-10-03-colour-picker.md). The
 * browser's change comes when the picker closes or the drag ends, so it's where a save goes.
 */
export function useNativeChange(ref: RefObject<HTMLInputElement | null>, onChange: (input: HTMLInputElement) => void): void {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const handle = () => latest.current(input);
    input.addEventListener("change", handle);
    return () => input.removeEventListener("change", handle);
  }, [ref]);
}

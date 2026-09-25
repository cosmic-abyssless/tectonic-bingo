import { useEffect, useState } from "react";

const isFocused = () => document.visibilityState === "visible" && document.hasFocus();

/** Whether the Player is looking at this page right now: its tab is showing and the browser window has focus. */
export function usePageFocused(): boolean {
  const [focused, setFocused] = useState(isFocused);
  useEffect(() => {
    const update = () => setFocused(isFocused());
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return focused;
}

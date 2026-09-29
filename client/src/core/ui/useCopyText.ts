import { useEffect, useState } from "react";

/**
 * Copies text to the clipboard, with `copied` true for two seconds after (like the Copy as CSV buttons' "Copied"), for
 * a button to show it worked. A browser that refuses (no clipboard outside a secure context) leaves it false.
 */
export function useCopyText(text: string): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Nothing to show: the button just doesn't flip to its check.
    }
  };

  return { copied, copy };
}

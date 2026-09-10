import { useEffect, useRef, useState } from "react";
import { toast } from "../core/ui/Toast";
import type { BingoPageModel } from "./types";

const CLIPBOARD_OPT_IN_KEY = "bingo:clipboardPasteOptIn";

function getImageFileFromDataTransfer(dt: DataTransfer | null | undefined): File | null {
  if (!dt) return null;
  for (const file of dt.files) {
    if (file.type.startsWith("image/")) return file;
  }
  for (const item of dt.items ?? []) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
}

// Best-effort, silent: only Chromium reliably supports reading images via
// the async Clipboard API today, and it throws for all sorts of ordinary
// reasons (permission not granted, empty clipboard, document not focused).
async function readClipboardImage(): Promise<File | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      return new File([blob], "clipboard-screenshot.png", { type: blob.type });
    }
  } catch {
    // Permission not granted, nothing image-shaped on the clipboard, or the
    // page lost focus between the event and the read — all fine to ignore.
  }
  return null;
}

/**
 * Site-wide screenshot-to-submit shortcuts for the board page:
 *  - drag a screenshot anywhere onto the page and drop it
 *  - paste one (Ctrl/Cmd+V) anywhere
 * Both open the submission modal with the image already staged for
 * analysis. A successful paste also opts the browser into checking the
 * clipboard again on focus (once granted, `clipboard-read` needs no further
 * gesture) — so if you copy a screenshot in-game and alt-tab back, we can
 * toast "found a screenshot, want to submit it?" without another paste.
 *
 * Returns whether a page-level drag is in progress (modal closed), so the
 * caller can show a "drop to submit" overlay.
 */
export function useScreenshotCapture(page: BingoPageModel): { dragActive: boolean } {
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);
  const lastClipboardSignature = useRef<string | null>(null);

  const canSubmit = page.canSubmit;
  const submitOpen = page.submit.open;
  const showSubmit = page.submit.show;

  useEffect(() => {
    if (!canSubmit) return;

    // Drop-to-open: only while the modal is closed. Once it's open,
    // useSubmissionFlow's own window drag listeners already handle drops
    // (replacing the staged screenshot) — handling it again here too would
    // double-run the analysis on the same drop.
    const onDragEnter = (e: DragEvent) => {
      if (submitOpen) return;
      e.preventDefault();
      if (dragCounter.current === 0) setDragActive(true);
      dragCounter.current++;
    };
    const onDragOver = (e: DragEvent) => {
      if (!submitOpen) e.preventDefault();
    };
    const onDragLeave = () => {
      if (submitOpen) return;
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (submitOpen) return;
      e.preventDefault();
      dragCounter.current = 0;
      setDragActive(false);
      const file = getImageFileFromDataTransfer(e.dataTransfer);
      if (file) showSubmit(undefined, file);
    };

    // Paste-to-open: no equivalent already exists (the in-modal dropzone is
    // drag/drop and file-picker only), so this always runs — re-showing an
    // already-open flow just feeds it the new file (see useSubmissionFlow's
    // initialFile effect), it doesn't reset anything else about it.
    const onPaste = (e: ClipboardEvent) => {
      const file = getImageFileFromDataTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      showSubmit(undefined, file);

      // Piggyback on this paste gesture to request standing clipboard-read
      // access, so a future focus (no gesture) can check the clipboard too.
      if (localStorage.getItem(CLIPBOARD_OPT_IN_KEY) !== "1") {
        localStorage.setItem(CLIPBOARD_OPT_IN_KEY, "1");
        navigator.clipboard?.read?.().catch(() => {});
      }
    };

    // Focus-triggered "found a screenshot" toast: only for players who've
    // already pasted one before (so we know clipboard-read is likely
    // granted, and that this pattern is one they actually use).
    const onFocus = () => {
      if (submitOpen) return;
      if (localStorage.getItem(CLIPBOARD_OPT_IN_KEY) !== "1") return;
      readClipboardImage().then((file) => {
        if (!file) return;
        const signature = `${file.size}:${file.type}`;
        if (signature === lastClipboardSignature.current) return;
        lastClipboardSignature.current = signature;
        toast({
          title: "Screenshot detected",
          description: "Found an image on your clipboard — submit it?",
          action: { label: "Submit", onPress: () => showSubmit(undefined, file) },
        });
      });
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("focus", onFocus);
    };
  }, [canSubmit, submitOpen, showSubmit]);

  return { dragActive: dragActive && !submitOpen };
}

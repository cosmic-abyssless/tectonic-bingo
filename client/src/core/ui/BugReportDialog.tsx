import { useContext, useState } from "react";
import * as bugReportsApi from "../../api/bugReportsApi";
import { Button } from "./Button";
import { Notice } from "./Card";
import { Textarea } from "./Field";
import { useDialogParts } from "./useDialogParts";
import { ThemeContext } from "../../themes/context";
import { useColorSchemePreference, useResolvedColorScheme } from "./colorScheme";

/** "comic · Blackout (dark, system)" — the look the reporter was seeing, for reproducing a visual bug. */
function describePalette(themeKey: string | undefined, palette: string | undefined, scheme: "light" | "dark", preference: string): string {
  return `${themeKey ?? "default"} · ${palette ?? scheme} (${scheme}${preference === "system" ? ", system" : ""})`;
}

export function BugReportDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { Dialog, DialogHeader } = useDialogParts();
  // The dialog also mounts on pages with no ThemeProvider around it (the context is then null).
  const theme = useContext(ThemeContext);
  const scheme = useResolvedColorScheme();
  const [schemePreference] = useColorSchemePreference();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function reset() {
    setDescription("");
    setError(null);
    setSent(false);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await bugReportsApi.createBugReport({
        description: description.trim(),
        pageUrl: window.location.pathname,
        userAgent: navigator.userAgent,
        palette: describePalette(theme?.key, theme?.palette, scheme, schemePreference),
      });
      setSent(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit the bug report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        onClose();
        reset();
      }}
    >
      <DialogHeader title="Report a bug" onClose={onClose} />
      <div className="space-y-3 p-5">
        {sent ? (
          <Notice tone="ok">Thanks — your report was submitted.</Notice>
        ) : (
          <>
            <Textarea
              aria-label="Bug description"
              placeholder="What happened? What did you expect instead?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              autoFocus
            />
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onPress={submit} isDisabled={!description.trim() || submitting}>
                {submitting ? "Submitting…" : "Submit report"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

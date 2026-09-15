import { useState } from "react";
import * as bugReportsApi from "../../api/bugReportsApi";
import { Button } from "./Button";
import { Notice } from "./Card";
import { Dialog, DialogHeader } from "./Dialog";
import { Textarea } from "./Field";

export function BugReportDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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

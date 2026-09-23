import { useContext, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BugReportWithReporter } from "@bingo/shared";
import * as bugReportsApi from "../../api/bugReportsApi";
import { queryKeys, useMyBugReports } from "../../api/queries";
import { Button } from "./Button";
import { Badge, Notice, ResolutionQuote } from "./Card";
import { Textarea } from "./Field";
import { timeAgo } from "./time";
import { displayName } from "./user";
import { useDialogParts } from "./useDialogParts";
import { ThemeContext } from "../../themes/context";
import { useColorSchemePreference, useResolvedColorScheme } from "./colorScheme";

const STATUS_TONE = { open: "warn", resolved: "ok", closed: "danger" } as const;
const STATUS_LABEL = { open: "Open", resolved: "Fixed", closed: "Closed" } as const;

/** "5 reports · 2 fixed · 1 open · 2 closed", each count colour-coded to match its status badge. */
function ReportStats({ reports }: { reports: BugReportWithReporter[] }) {
  const counts = useMemo(
    () => ({
      resolved: reports.filter((r) => r.status === "resolved").length,
      open: reports.filter((r) => r.status === "open").length,
      closed: reports.filter((r) => r.status === "closed").length,
    }),
    [reports],
  );
  return (
    <p className="text-xs text-on-surface-muted">
      {reports.length} report{reports.length === 1 ? "" : "s"} · <span className="font-medium text-ok">{counts.resolved} fixed</span> ·{" "}
      <span className="font-medium text-warn">{counts.open} open</span> · <span className="font-medium text-danger">{counts.closed} closed</span>
    </p>
  );
}

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
  const queryClient = useQueryClient();
  const { data: myReports, isLoading: reportsLoading, error: reportsError } = useMyBugReports(isOpen);

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
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBugReports() });
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
      <div className="space-y-3 border-t border-outline p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-on-surface">Your reports</h3>
          {!reportsLoading && !reportsError && !!myReports?.bugReports.length && <ReportStats reports={myReports.bugReports} />}
        </div>
        {reportsLoading ? (
          <p className="text-sm text-on-surface-muted">Loading…</p>
        ) : reportsError ? (
          <Notice tone="danger">Failed to load your reports.</Notice>
        ) : !myReports?.bugReports.length ? (
          <p className="text-sm text-on-surface-subtle">You haven't reported anything yet.</p>
        ) : (
          <ul className="space-y-3">
            {myReports.bugReports.map((report) => (
              <li key={report.id} className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-on-surface-muted">{timeAgo(report.createdAt)}</span>
                  <Badge tone={STATUS_TONE[report.status]}>{STATUS_LABEL[report.status]}</Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm text-on-surface">{report.description}</p>
                {report.status !== "open" && report.resolutionMessage && (
                  <ResolutionQuote
                    message={report.resolutionMessage}
                    author={report.resolvedByUser ? displayName(report.resolvedByUser) : "A moderator"}
                    at={report.resolvedAt ? timeAgo(report.resolvedAt) : null}
                    tone={report.status === "resolved" ? "ok" : "danger"}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

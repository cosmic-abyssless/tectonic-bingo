import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Bingo, BugReportStatus, BugReportWithReporter } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useBugReports } from "../../api/adminQueries";
import { useBingos } from "../../api/queries";
import { Badge, Notice, ResolutionQuote } from "../ui/Card";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Field";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";

const STATUS_TONE = { open: "warn", resolved: "ok", closed: "danger" } as const;
const STATUS_LABEL = { open: "Open", resolved: "Fixed", closed: "Closed" } as const;

function BugReportRow({ report, bingo }: { report: BugReportWithReporter; bingo: Bingo | null }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function setStatus(status: BugReportStatus) {
    setPending(true);
    setError(null);
    try {
      await adminApi.setBugReportStatus(report.id, status, status !== "open" ? message : undefined);
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.bugReports });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update the bug report");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-xs text-on-surface-muted">
          {report.reporter ? displayName(report.reporter) : "Unknown user"} · {timeAgo(report.createdAt)}
          {report.pageUrl && <span className="font-mono"> · {report.pageUrl}</span>}
          {report.palette && <span> · {report.palette}</span>}
        </div>
        <Badge tone={STATUS_TONE[report.status]}>{STATUS_LABEL[report.status]}</Badge>
      </div>
      {bingo ? (
        <Link to={`/b/${bingo.slug}/mod`} className="inline-block text-xs text-on-surface-muted hover:underline">
          {bingo.name}
        </Link>
      ) : (
        <span className="text-xs text-on-surface-subtle">Not tied to a bingo</span>
      )}
      <p className="whitespace-pre-wrap text-sm text-on-surface">{report.description}</p>
      {report.status !== "open" && report.resolutionMessage && (
        <ResolutionQuote
          message={report.resolutionMessage}
          author={report.resolvedByUser ? displayName(report.resolvedByUser) : "A moderator"}
          at={report.resolvedAt ? timeAgo(report.resolvedAt) : null}
          tone={report.status === "resolved" ? "ok" : "danger"}
        />
      )}
      {report.status === "open" && (
        <Textarea
          aria-label="Optional note for the reporter"
          placeholder="Optional note for the reporter (e.g. what was fixed, or why it won't be — shown once closed)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
        />
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        {report.status === "open" ? (
          <>
            <Button variant="primary" size="sm" onPress={() => setStatus("resolved")} isDisabled={pending}>
              {pending ? "Saving…" : "Mark fixed"}
            </Button>
            <Button variant="danger" size="sm" onPress={() => setStatus("closed")} isDisabled={pending}>
              {pending ? "Saving…" : "Close"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onPress={() => setStatus("open")} isDisabled={pending}>
            {pending ? "Saving…" : "Reopen"}
          </Button>
        )}
      </div>
    </li>
  );
}

export function BugReportsPanel() {
  const { data, isLoading } = useBugReports();
  const { data: bingosData } = useBingos();
  const reports = data?.bugReports ?? [];
  const bingoById = useMemo(() => new Map((bingosData?.bingos ?? []).map((b) => [b.id, b])), [bingosData]);

  return isLoading ? (
    <p className="text-sm text-on-surface-muted">Loading…</p>
  ) : reports.length === 0 ? (
    <p className="text-sm text-on-surface-subtle">No bug reports yet.</p>
  ) : (
    <ul className="-mx-4 -mb-4 divide-y divide-outline border-t border-outline">
      {reports.map((r) => (
        <BugReportRow key={r.id} report={r} bingo={r.bingoId ? (bingoById.get(r.bingoId) ?? null) : null} />
      ))}
    </ul>
  );
}

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Bingo, BugReportWithReporter } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys, useBugReports } from "../../api/adminQueries";
import { useBingos } from "../../api/queries";
import { Badge, Card, CardHeader, Notice } from "../ui/Card";
import { Button } from "../ui/Button";
import { timeAgo } from "../ui/time";
import { displayName } from "../ui/user";

function BugReportRow({ report, bingo }: { report: BugReportWithReporter; bingo: Bingo | null }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await adminApi.resolveBugReport(report.id, report.status === "open");
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
        <Badge tone={report.status === "resolved" ? "ok" : "warn"}>{report.status === "resolved" ? "Resolved" : "Open"}</Badge>
      </div>
      {bingo ? (
        <Link to={`/b/${bingo.slug}/mod`} className="inline-block text-xs text-on-surface-muted hover:underline">
          {bingo.name}
        </Link>
      ) : (
        <span className="text-xs text-on-surface-subtle">Not tied to a bingo</span>
      )}
      <p className="whitespace-pre-wrap text-sm text-on-surface">{report.description}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button variant="ghost" size="sm" onPress={toggle} isDisabled={pending}>
        {report.status === "resolved" ? "Reopen" : "Mark resolved"}
      </Button>
    </li>
  );
}

export function BugReportsPanel() {
  const { data, isLoading } = useBugReports();
  const { data: bingosData } = useBingos();
  const reports = data?.bugReports ?? [];
  const bingoById = useMemo(() => new Map((bingosData?.bingos ?? []).map((b) => [b.id, b])), [bingosData]);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader title="Bug reports" description="Submitted from the header button on any page." />
      {isLoading ? (
        <p className="px-5 pb-5 text-sm text-on-surface-muted">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-on-surface-subtle">No bug reports yet.</p>
      ) : (
        <ul className="divide-y divide-outline border-t border-outline">
          {reports.map((r) => <BugReportRow key={r.id} report={r} bingo={r.bingoId ? (bingoById.get(r.bingoId) ?? null) : null} />)}
        </ul>
      )}
    </Card>
  );
}

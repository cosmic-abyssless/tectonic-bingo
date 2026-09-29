import type { ReactNode } from "react";
import { NOT_RECORDED_HISTORICAL } from "@bingo/shared";
import { useBingoHeader } from "../../headless/useBingoHeader";
import { useBingoMenuEntries } from "../../headless/useBingoMenuEntries";
import { AppHeader } from "../ui/AppHeader";
import { EmptyState, Notice } from "../ui/Card";
import { InfoIcon } from "../ui/icons";

/** A section of a Historical Bingo whose data was never recorded: says so, in place of zeros or an empty chart. */
export function NotRecorded({ what }: { what?: ReactNode }) {
  return (
    <Notice tone="neutral" icon={<InfoIcon size={14} />}>
      {what && <strong>{what}: </strong>}
      {NOT_RECORDED_HISTORICAL}
    </Notice>
  );
}

/**
 * A whole page of a Historical Bingo that has nothing to show (its Stats, Draft room, Rewind or Wrapped, reached by
 * a link or typed address; the Bingo's own header never links there).
 */
export function NotRecordedPage({ slug, title, bingoName }: { slug: string; title: string; bingoName: string }) {
  const menuEntries = useBingoMenuEntries(slug, useBingoHeader(slug));
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader title={title} subtitle={bingoName} menuEntries={menuEntries} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState icon={<InfoIcon />} title={NOT_RECORDED_HISTORICAL}>
          {bingoName} ran on another website before this one, which didn't record this.
        </EmptyState>
      </main>
    </div>
  );
}

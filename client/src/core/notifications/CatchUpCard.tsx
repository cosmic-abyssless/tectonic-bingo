import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BingoShellResponse } from "@bingo/shared";
import { useCatchUp, useDismissCatchUp, useNotificationSettings } from "../../api/notificationsApi";
import { Button } from "../ui/Button";
import { ChevronDownIcon, ChevronUpIcon } from "../ui/icons";
import { NotificationOffer } from "./NotificationOffer";

/** Stayed on the page this long, and the card goes by itself. */
const READ_AFTER_MS = 4 * 60_000;

function since(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const time = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (at.toDateString() === today.toDateString()) return `today ${time}`;
  if (at.toDateString() === yesterday.toDateString()) return `yesterday ${time}`;
  return at.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Catch-up (CONTEXT.md): what happened in this Bingo since the viewer last had it open, at the top of the Board, never a
 * modal. One line collapsed, the sections expanded, each line linking to what it's about. Got it hides it until the next
 * visit, and so does staying a few minutes. With Catch-up off, coming back to a Live Bingo may offer it instead, once.
 */
export function CatchUpCard({ slug, shell }: { slug: string; shell: BingoShellResponse }) {
  const settings = useNotificationSettings().data?.settings;
  const enabled = !!settings?.catchUpEnabled;
  const { data } = useCatchUp(slug, !!settings);
  const dismiss = useDismissCatchUp(slug);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const hasCard = enabled && !!data?.since && data.sections.length > 0;
  useEffect(() => {
    if (!hasCard) return;
    const timer = setTimeout(() => setHidden(true), READ_AFTER_MS);
    return () => clearTimeout(timer);
  }, [hasCard]);

  if (settings && !settings.catchUpEnabled) {
    // The offer: coming back to a Live Bingo with Catch-up off and something to show. Accepting shows it at once.
    return (
      <NotificationOffer bingoId={shell.bingo.id} offer="catch_up" when={shell.bingo.stage === "live" && !!data?.wouldShow}>
        Show a catch-up when you come back?
      </NotificationOffer>
    );
  }
  if (!hasCard || hidden || !data?.since) return null;

  return (
    <section aria-label="Catch-up" className="rounded-md border border-outline bg-surface-raised px-3 py-2 text-sm text-on-surface">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          {expanded ? <ChevronUpIcon className="shrink-0" /> : <ChevronDownIcon className="shrink-0" />}
          <span className="min-w-0">
            <span className="font-medium">Since {since(data.since)}:</span> {data.summary}
          </span>
        </button>
        <Button size="sm" variant="secondary" onPress={() => dismiss.mutate()}>
          Got it
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 grid gap-3 border-t border-outline pt-2 sm:grid-cols-2">
          {data.sections.map((section) => (
            <div key={section.key}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">{section.title}</h3>
              <ul className="mt-1 space-y-0.5">
                {section.lines.map((line, i) => (
                  <li key={i}>
                    {line.link ? (
                      <Link to={line.link} className="text-on-surface hover:text-accent hover:underline">
                        {line.text}
                      </Link>
                    ) : (
                      <span className="text-on-surface-muted">{line.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

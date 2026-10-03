import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMyWrapped } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useBingoPage } from "./BingoPageProvider";
import { buildWrappedStory } from "./wrappedModel";
import { hasReachedOutro, rememberOutroReached } from "./wrappedOutroStore";
import type { WrappedModel } from "./types";

const WrappedContext = createContext<WrappedModel | null>(null);

/**
 * Wrapped's headless state (CONTEXT.md "Wrapped"): the viewer's published Wrapped (or a Moderator's preview), as the
 * story's section models. It only reads what publishing stored: nothing here asks the server to recompute a stat.
 * Sits inside BingoPageProvider, whose page model says whether this viewer may open it.
 */
export function WrappedProvider({ slug, children, renderLoading, renderError }: { slug: string; children: ReactNode; renderLoading: () => ReactNode; renderError: (message: string) => ReactNode }) {
  const page = useBingoPage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, isLoading } = useMyWrapped(slug, page.wrapped.canOpen);
  // Read once, as the page opens: reaching the Outro on this visit doesn't bring the jump in under the viewer.
  const [outroReachedBefore] = useState(() => hasReachedOutro(slug));

  const model = useMemo(
    () =>
      data && user
        ? buildWrappedStory(
            data,
            {
              viewerId: user.id,
              viewerName: page.user.displayName,
              viewerAvatarUrl: page.user.avatarUrl,
              startsAt: page.bingo.startsAt,
              endsAt: page.bingo.endsAt,
              outroReachedBefore,
            },
            { goToBoard: () => navigate(`/b/${slug}`), goToRewind: () => navigate(`/b/${slug}/rewind`), goToFeedback: () => navigate(`/b/${slug}/feedback`), outroReached: () => rememberOutroReached(slug) },
            slug,
            // The Feedback form, while it's open to this viewer (the Board's page model asked the server).
            page.feedback.canOpen ? { responded: page.feedback.responded } : null,
          )
        : null,
    [data, user, page.user.displayName, page.user.avatarUrl, page.bingo.startsAt, page.bingo.endsAt, navigate, slug, outroReachedBefore, page.feedback.canOpen, page.feedback.responded],
  );

  if (error) return <>{renderError(error instanceof Error ? error.message : "Couldn't load Wrapped")}</>;
  if (isLoading || !model) return <>{renderLoading()}</>;
  return <WrappedContext.Provider value={model}>{children}</WrappedContext.Provider>;
}

export function useWrappedModel(): WrappedModel {
  const model = useContext(WrappedContext);
  if (!model) throw new Error("useWrappedModel must be used within WrappedProvider");
  return model;
}

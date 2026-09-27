import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMyWrapped } from "../api/queries";
import { useAuth } from "../context/AuthContext";
import { useBingoPage } from "./BingoPageProvider";
import { buildWrappedStory } from "./wrappedModel";
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

  const model = useMemo(
    () =>
      data && user
        ? buildWrappedStory(
            data,
            { viewerId: user.id, viewerName: page.user.displayName, credits: page.bingo.wrappedCredits, startsAt: page.bingo.startsAt, endsAt: page.bingo.endsAt },
            { goToBoard: () => navigate(`/b/${slug}`), goToRewind: () => navigate(`/b/${slug}/rewind`) },
            slug,
          )
        : null,
    [data, user, page.user.displayName, page.bingo.wrappedCredits, page.bingo.startsAt, page.bingo.endsAt, navigate, slug],
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

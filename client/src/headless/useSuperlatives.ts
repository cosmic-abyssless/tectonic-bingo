import { useMemo } from "react";
import { useClearSuperlativeVote, useMySuperlativeBallot, useSetSuperlativeVote } from "../api/queries";
import { avatarUrl, displayName } from "../core/ui/user";

export interface SuperlativeNomineeModel {
  id: string;
  displayName: string;
  avatarUrl: string;
  isCaptain: boolean;
  isCoCaptain: boolean;
  isMyDuoPartner: boolean;
}

export interface SuperlativeCategoryModel {
  id: string;
  name: string;
  /** "3 of 5 voted": a participation count, never who voted or who they picked. */
  votedLabel: string;
  pick: SuperlativeNomineeModel | null;
}

export interface SuperlativesModel {
  isLoading: boolean;
  categories: SuperlativeCategoryModel[];
  teammates: SuperlativeNomineeModel[];
  setPick(categoryId: string, nomineeUserId: string): void;
  clearPick(categoryId: string): void;
}

/** Superlative (CONTEXT.md): the caller's own Team's ballot, mapped onto the themeable shape the Board page shows. */
export function useSuperlativesModel(slug: string | undefined, enabled: boolean): SuperlativesModel {
  const { data, isLoading } = useMySuperlativeBallot(slug, enabled);
  const setVote = useSetSuperlativeVote(slug ?? "");
  const clearVote = useClearSuperlativeVote(slug ?? "");

  const teammates = useMemo<SuperlativeNomineeModel[]>(
    () => (data?.teammates ?? []).map((t) => ({ id: t.id, displayName: displayName(t), avatarUrl: avatarUrl(t), isCaptain: t.isCaptain, isCoCaptain: t.isCoCaptain, isMyDuoPartner: t.isMyDuoPartner })),
    [data],
  );
  const teammateById = useMemo(() => new Map(teammates.map((t) => [t.id, t])), [teammates]);

  const categories = useMemo<SuperlativeCategoryModel[]>(
    () => (data?.categories ?? []).map((c) => ({ id: c.id, name: c.name, votedLabel: `${c.votedCount} of ${c.eligibleCount} voted`, pick: c.myPick ? (teammateById.get(c.myPick) ?? null) : null })),
    [data, teammateById],
  );

  return {
    isLoading,
    categories,
    teammates,
    setPick: (categoryId, nomineeUserId) => setVote.mutate({ categoryId, nomineeUserId }),
    clearPick: (categoryId) => clearVote.mutate(categoryId),
  };
}

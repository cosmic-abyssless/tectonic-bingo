import { useState } from "react";
import type { PartnerCandidate } from "@bingo/shared";
import { useMyPairing, usePartnerCandidates, useRemovePairing, useRequestPairing, useRespondToPairing, useUnpairedSignups } from "../api/queries";
import { displayName } from "../core/ui/user";

// A duo bingo's partner step (under an active signup, in the signup stage) as a view model: what
// core/signup/PartnerPanel (the default look) and a theme's own SignupStage draw.

export interface PartnerPanelModel {
  /** Paired: who with, and removing the pairing (asked first, since it unpairs them both). */
  partner: { name: string; leave: { confirming: boolean; ask: () => void; cancel: () => void; confirm: () => void } } | null;
  /** Why they're unpaired now, when a pairing ended or a request was declined; says to pick someone new. */
  lastOutcome: string | null;
  /** Requests others have made to pair with them. */
  incoming: { id: string; name: string; accept: () => void; decline: () => void }[];
  /** Their own request, waiting on the other player. */
  outgoing: { name: string; cancel: () => void } | null;
  /** Unpaired with no request of their own out: choosing someone to ask. */
  picker: {
    /** Anyone in the clan (by RSN), searched; they needn't have signed up yet. */
    options: { id: string; label: string }[];
    optionsError: string | null;
    target: string;
    setTarget: (discordId: string) => void;
    send: () => void;
    /** Everyone else signed up without a partner, each a one-press request; null until loaded. */
    unpaired: { id: string; rsn: string; waiting: boolean; request: () => void }[] | null;
  } | null;
  /** A request, reply or removal is in flight. */
  busy: boolean;
  error: string | null;
}

// Named by RSN: the clan roster's first RSN, else (for someone who has logged in but has none) their Discord name.
function candidateLabel(c: PartnerCandidate): string {
  if (c.rsns.length) return c.rsns[0]!;
  return c.user ? displayName(c.user) : c.discordId;
}

/** Null while loading. */
export function usePartnerPanel(slug: string): PartnerPanelModel | null {
  const { data: state, isLoading } = useMyPairing(slug, true);
  const needsPicker = !!state && !state.partner && !state.outgoing;
  const { data: candidatesData, error: candidatesError } = usePartnerCandidates(slug, needsPicker);
  const { data: unpairedData } = useUnpairedSignups(slug, needsPicker);
  const request = useRequestPairing(slug);
  const remove = useRemovePairing(slug);
  const respond = useRespondToPairing(slug);

  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  if (isLoading || !state) return null;

  function run(action: () => Promise<unknown>) {
    setError(null);
    action().catch((e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong"));
  }

  const { partner, outgoing, lastOutcome } = state;

  return {
    partner: partner
      ? {
          name: partner.name,
          leave: {
            confirming: confirmingLeave,
            ask: () => setConfirmingLeave(true),
            cancel: () => setConfirmingLeave(false),
            confirm: () => run(() => remove.mutateAsync(partner.pairing.id).then(() => setConfirmingLeave(false))),
          },
        }
      : null,
    lastOutcome:
      !partner && lastOutcome
        ? `${
            lastOutcome.status === "declined"
              ? `${lastOutcome.other.name} declined your request.`
              : lastOutcome.status === "left"
                ? `You and ${lastOutcome.other.name} are no longer paired.`
                : `${lastOutcome.other.name} withdrew their signup.`
          } Pick a new partner below.`
        : null,
    incoming: partner
      ? []
      : state.incoming.map(({ pairing, requester }) => ({
          id: pairing.id,
          name: requester.name,
          accept: () => run(() => respond.mutateAsync({ pairingId: pairing.id, accept: true })),
          decline: () => run(() => respond.mutateAsync({ pairingId: pairing.id, accept: false })),
        })),
    outgoing: !partner && outgoing ? { name: outgoing.target.name, cancel: () => run(() => remove.mutateAsync(outgoing.pairing.id)) } : null,
    picker: needsPicker
      ? {
          options: (candidatesData?.candidates ?? []).map((c) => ({ id: c.discordId, label: candidateLabel(c) })),
          optionsError: candidatesError ? candidatesError.message : null,
          target,
          setTarget,
          send: () => run(() => request.mutateAsync(target).then(() => setTarget(""))),
          unpaired: unpairedData ? unpairedData.players.map((p) => ({ id: p.userId, rsn: p.rsn, waiting: p.waiting, request: () => run(() => request.mutateAsync(p.discordId)) })) : null,
        }
      : null,
    busy: request.isPending || remove.isPending || respond.isPending,
    error,
  };
}

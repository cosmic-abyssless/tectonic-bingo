import { useState } from "react";
import type { PartnerCandidate } from "@bingo/shared";
import { useMyPairing, usePartnerCandidates, useRemovePairing, useRequestPairing, useRespondToPairing, useUnpairedSignups } from "../../api/queries";
import { Button } from "../ui/Button";
import { Card, CardHeader, Notice } from "../ui/Card";
import { Field } from "../ui/Field";
import { SearchableSelect } from "../ui/SearchableSelect";
import { CheckIcon, ClockIcon, UsersIcon } from "../ui/icons";
import { displayName } from "../ui/user";

// Named by RSN: the clan roster's first RSN, else (for someone who has logged in but has none) their Discord name.
function candidateLabel(c: PartnerCandidate): string {
  if (c.rsns.length) return c.rsns[0]!;
  return c.user ? displayName(c.user) : c.discordId;
}

/** Duo-mode partner picker shown under an active signup during the signup stage. */
export function PartnerPanel({ slug }: { slug: string }) {
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

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const busy = request.isPending || remove.isPending || respond.isPending;

  return (
    <Card className="mx-auto max-w-lg">
      {/* Step 2 of a duo signup; step 1 is the signup form above it (SignupForm). */}
      <CardHeader title="2. Duo partner" description="This bingo is drafted in pairs. Pick who you want to play with — they need to accept before the draft." />
      <div className="space-y-4 p-5">
        {state.partner && !confirmingLeave && (
          <Notice tone="ok" icon={<CheckIcon />}>
            <div className="flex items-center gap-3">
              <span className="flex-1">
                You're paired with <strong>{state.partner.name}</strong>. You'll be drafted together.
              </span>
              <Button size="sm" variant="ghost" className="-my-1.5" isDisabled={busy} onPress={() => setConfirmingLeave(true)}>
                Remove pairing
              </Button>
            </div>
          </Notice>
        )}

        {state.partner && confirmingLeave && (
          <Notice tone="danger">
            <div className="flex items-center gap-3">
              <span className="flex-1">Remove your pairing with {state.partner.name}? You'll both need to find a new partner.</span>
              <Button size="sm" variant="ghost" onPress={() => setConfirmingLeave(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                isDisabled={busy}
                onPress={() => run(() => remove.mutateAsync(state.partner!.pairing.id).then(() => setConfirmingLeave(false)))}
              >
                Confirm
              </Button>
            </div>
          </Notice>
        )}

        {!state.partner && state.lastOutcome && (
          <Notice tone="warn">
            {state.lastOutcome.status === "declined"
              ? `${state.lastOutcome.other.name} declined your request.`
              : state.lastOutcome.status === "left"
                ? `You and ${state.lastOutcome.other.name} are no longer paired.`
                : `${state.lastOutcome.other.name} withdrew their signup.`}{" "}
            Pick a new partner below.
          </Notice>
        )}

        {!state.partner && state.incoming.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-on-surface-muted">Players who want to pair with you</p>
            <ul className="divide-y divide-outline rounded-md border border-outline">
              {state.incoming.map(({ pairing, requester }) => (
                <li key={pairing.id} className="flex items-center gap-3 px-3 py-2">
                  <UsersIcon className="shrink-0 text-on-surface-subtle" />
                  <span className="flex-1 truncate text-sm text-on-surface">{requester.name}</span>
                  <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => run(() => respond.mutateAsync({ pairingId: pairing.id, accept: false }))}>
                    Decline
                  </Button>
                  <Button size="sm" variant="primary" isDisabled={busy} onPress={() => run(() => respond.mutateAsync({ pairingId: pairing.id, accept: true }))}>
                    Accept
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!state.partner && state.outgoing && (
          <Notice tone="info" icon={<ClockIcon />}>
            <div className="flex items-center gap-3">
              <span className="flex-1">
                Waiting for <strong>{state.outgoing.target.name}</strong> to accept.
              </span>
              <Button size="sm" variant="ghost" className="-my-1.5" isDisabled={busy} onPress={() => run(() => remove.mutateAsync(state.outgoing!.pairing.id))}>
                Cancel request
              </Button>
            </div>
          </Notice>
        )}

        {needsPicker && (
          <>
            {candidatesError && <Notice tone="danger">{candidatesError.message}</Notice>}
            <p className="text-sm text-on-surface-muted">
              You're signed up. You don't need a partner yet — come back and pick one any time before signups close. Your partner also has to sign up.
            </p>
            <Field as="div" label="Request a partner" hint="Anyone in the clan can be picked; if they haven't signed up yet they'll see your request when they do.">
              <SearchableSelect
                value={target}
                options={(candidatesData?.candidates ?? []).map((c) => ({ id: c.discordId, label: candidateLabel(c) }))}
                placeholder="Search players…"
                onChange={setTarget}
              />
            </Field>
            <Button variant="primary" isDisabled={!target || busy} onPress={() => run(() => request.mutateAsync(target).then(() => setTarget("")))}>
              Send request
            </Button>
            {unpairedData && (
              <div className="space-y-2">
                <p className="text-sm text-on-surface-muted">
                  Signed up without a partner{unpairedData.players.length > 0 ? ` (${unpairedData.players.length})` : ""}
                </p>
                {unpairedData.players.length === 0 ? (
                  <p className="text-sm text-on-surface-subtle">Everyone else who's signed up already has a partner.</p>
                ) : (
                  <ul className="max-h-64 divide-y divide-outline overflow-y-auto rounded-md border border-outline">
                    {unpairedData.players.map((p) => (
                      <li key={p.userId} className="flex items-center gap-3 px-3 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-on-surface">{p.rsn}</div>
                          {p.waiting && <div className="text-xs text-on-surface-subtle">Waiting on a reply to their own request</div>}
                        </div>
                        <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => run(() => request.mutateAsync(p.discordId))}>
                          Request
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Card>
  );
}

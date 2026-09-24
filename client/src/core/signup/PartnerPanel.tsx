import { usePartnerPanel } from "../../headless/usePartnerPanel";
import { Button } from "../ui/Button";
import { Card, CardHeader, Notice } from "../ui/Card";
import { Field } from "../ui/Field";
import { SearchableSelect } from "../ui/SearchableSelect";
import { CheckIcon, ClockIcon, UsersIcon } from "../ui/icons";

/** Duo-mode partner picker shown under an active signup during the signup stage. */
export function PartnerPanel({ slug }: { slug: string }) {
  const panel = usePartnerPanel(slug);
  if (!panel) return null;
  const { partner, picker, busy } = panel;

  return (
    <Card className="mx-auto max-w-lg">
      {/* Step 2 of a duo signup; step 1 is the signup form above it (SignupForm). */}
      <CardHeader title="2. Duo partner" description="This bingo is drafted in pairs. Pick who you want to play with — they need to accept before the draft." />
      <div className="space-y-4 p-5">
        {partner && !partner.leave.confirming && (
          <Notice tone="ok" icon={<CheckIcon />}>
            <div className="flex items-center gap-3">
              <span className="flex-1">
                You're paired with <strong>{partner.name}</strong>. You'll be drafted together.
              </span>
              <Button size="sm" variant="ghost" className="-my-1.5" isDisabled={busy} onPress={partner.leave.ask}>
                Remove pairing
              </Button>
            </div>
          </Notice>
        )}

        {partner && partner.leave.confirming && (
          <Notice tone="danger">
            <div className="flex items-center gap-3">
              <span className="flex-1">Remove your pairing with {partner.name}? You'll both need to find a new partner.</span>
              <Button size="sm" variant="ghost" onPress={partner.leave.cancel}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" isDisabled={busy} onPress={partner.leave.confirm}>
                Confirm
              </Button>
            </div>
          </Notice>
        )}

        {panel.lastOutcome && <Notice tone="warn">{panel.lastOutcome}</Notice>}

        {panel.incoming.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-on-surface-muted">Players who want to pair with you</p>
            <ul className="divide-y divide-outline rounded-md border border-outline">
              {panel.incoming.map((req) => (
                <li key={req.id} className="flex items-center gap-3 px-3 py-2">
                  <UsersIcon className="shrink-0 text-on-surface-subtle" />
                  <span className="flex-1 truncate text-sm text-on-surface">{req.name}</span>
                  <Button size="sm" variant="ghost" isDisabled={busy} onPress={req.decline}>
                    Decline
                  </Button>
                  <Button size="sm" variant="primary" isDisabled={busy} onPress={req.accept}>
                    Accept
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {panel.outgoing && (
          <Notice tone="info" icon={<ClockIcon />}>
            <div className="flex items-center gap-3">
              <span className="flex-1">
                Waiting for <strong>{panel.outgoing.name}</strong> to accept.
              </span>
              <Button size="sm" variant="ghost" className="-my-1.5" isDisabled={busy} onPress={panel.outgoing.cancel}>
                Cancel request
              </Button>
            </div>
          </Notice>
        )}

        {picker && (
          <>
            {picker.optionsError && <Notice tone="danger">{picker.optionsError}</Notice>}
            <Field as="div" label="Request a partner" hint="Anyone in the clan can be picked; if they haven't signed up yet they'll see your request when they do.">
              <SearchableSelect value={picker.target} options={picker.options} placeholder="Search players…" onChange={picker.setTarget} />
            </Field>
            <Button variant="primary" isDisabled={!picker.target || busy} onPress={picker.send}>
              Send request
            </Button>
            {picker.unpaired && (
              <div className="space-y-2">
                <p className="text-sm text-on-surface-muted">
                  Signed up without a partner{picker.unpaired.length > 0 ? ` (${picker.unpaired.length})` : ""}
                </p>
                {picker.unpaired.length === 0 ? (
                  <p className="text-sm text-on-surface-subtle">Everyone else who's signed up already has a partner.</p>
                ) : (
                  <ul className="max-h-64 divide-y divide-outline overflow-y-auto rounded-md border border-outline">
                    {picker.unpaired.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-3 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-on-surface">{p.rsn}</div>
                          {p.waiting && <div className="text-xs text-on-surface-subtle">Waiting on a reply to their own request</div>}
                        </div>
                        <Button size="sm" variant="ghost" isDisabled={busy} onPress={p.request}>
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

        {panel.error && <Notice tone="danger">{panel.error}</Notice>}
      </div>
    </Card>
  );
}

import { usePartnerPanel } from "../../../headless";
import { ComicField } from "../submission/ComicField";
import { SearchableSelect } from "../../../core/ui/SearchableSelect";
import { WikiIcon } from "../../../core/ui/ItemIcon";
import { AlertIcon, CheckIcon, UsersIcon } from "../../../core/ui/icons";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";
import { Callout, RowList, Sheet, SubHead } from "./parts";

/** Step 2 of a duo signup, under the form: who they're paired with, or finding someone. */
export function PartnerSheet({ slug }: { slug: string }) {
  const { colors } = useComic();
  const panel = usePartnerPanel(slug);
  if (!panel) return null;
  const { partner, picker, busy } = panel;

  return (
    <Sheet step={2} title="Duo partner" description="This bingo is drafted in pairs. Pick who you want to play with — they need to accept before the draft.">
      {partner &&
        (partner.leave.confirming ? (
          <Callout tone="danger">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1 font-semibold">Remove your pairing with {partner.name}? You'll both need to find a new partner.</span>
              <ComicButton size="sm" variant="ghost" onPress={partner.leave.cancel} sfx={false}>
                Cancel
              </ComicButton>
              <ComicButton size="sm" variant="danger" isDisabled={busy} onPress={partner.leave.confirm}>
                Remove
              </ComicButton>
            </div>
          </Callout>
        ) : (
          <Callout tone="ok" icon={<CheckIcon />}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm">You're paired with</div>
                <div className="truncate text-2xl uppercase leading-tight" style={{ fontFamily: COMIC_FONT, letterSpacing: "0.03em", color: colors.INK }}>
                  {partner.name}
                </div>
                <div className="text-sm">You'll be drafted together.</div>
              </div>
              <ComicButton size="sm" variant="ghost" isDisabled={busy} onPress={partner.leave.ask} sfx={false}>
                Remove pairing
              </ComicButton>
            </div>
          </Callout>
        ))}

      {panel.lastOutcome && (
        <Callout tone="warn" icon={<AlertIcon />}>
          {panel.lastOutcome}
        </Callout>
      )}

      {panel.incoming.length > 0 && (
        <div className="space-y-2">
          <SubHead>Players who want to pair with you</SubHead>
          <RowList>
            {panel.incoming.map((req) => (
              <li key={req.id} className="flex items-center gap-3 px-3 py-2">
                <UsersIcon className="shrink-0" style={{ color: colors.INK_SUBTLE }} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: colors.INK }}>
                  {req.name}
                </span>
                <ComicButton size="sm" variant="ghost" isDisabled={busy} onPress={req.decline} sfx={false}>
                  Decline
                </ComicButton>
                <ComicButton size="sm" variant="primary" isDisabled={busy} onPress={req.accept}>
                  Accept
                </ComicButton>
              </li>
            ))}
          </RowList>
        </div>
      )}

      {panel.outgoing && (
        <Callout tone="info">
          <div className="flex flex-wrap items-center gap-3">
            {/* In the row rather than the callout's icon slot, so it centres on the line (the slot top-aligns, for
                notices that wrap). The wiki's Giant stopwatch, at its own 27x26. */}
            <WikiIcon name="Giant stopwatch" className="h-[26px] w-[27px] [image-rendering:pixelated]" />
            <span className="flex-1">
              Waiting for <strong style={{ color: colors.INK }}>{panel.outgoing.name}</strong> to accept.
            </span>
            <ComicButton size="sm" variant="ghost" isDisabled={busy} onPress={panel.outgoing.cancel} sfx={false}>
              Cancel request
            </ComicButton>
          </div>
        </Callout>
      )}

      {picker && (
        <>
          {picker.optionsError && (
            <Callout tone="danger" icon={<AlertIcon />}>
              {picker.optionsError}
            </Callout>
          )}
          <div className="space-y-3">
            <ComicField as="div" label="Request a partner" hint="Anyone in the clan can be picked; if they haven't signed up yet they'll see your request when they do.">
              <SearchableSelect value={picker.target} options={picker.options} placeholder="Search players…" onChange={picker.setTarget} />
            </ComicField>
            <ComicButton variant="primary" isDisabled={!picker.target || busy} onPress={picker.send}>
              Send request
            </ComicButton>
          </div>
          {picker.unpaired && (
            <div className="space-y-2">
              <SubHead>
                Signed up without a partner{picker.unpaired.length > 0 ? ` (${picker.unpaired.length})` : ""}
              </SubHead>
              {picker.unpaired.length === 0 ? (
                <p className="text-sm" style={{ color: colors.INK_SUBTLE }}>
                  Everyone else who's signed up already has a partner.
                </p>
              ) : (
                <RowList scroll>
                  {picker.unpaired.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold" style={{ color: colors.INK }}>
                          {p.rsn}
                        </div>
                        {p.waiting && (
                          <div className="text-xs" style={{ color: colors.INK_SUBTLE }}>
                            Waiting on a reply to their own request
                          </div>
                        )}
                      </div>
                      <ComicButton size="sm" variant="secondary" isDisabled={busy} onPress={p.request}>
                        Request
                      </ComicButton>
                    </li>
                  ))}
                </RowList>
              )}
            </div>
          )}
        </>
      )}

      {panel.error && (
        <Callout tone="danger" icon={<AlertIcon />}>
          {panel.error}
        </Callout>
      )}
    </Sheet>
  );
}

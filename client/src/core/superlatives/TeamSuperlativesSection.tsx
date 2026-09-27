import type { Key } from "react-aria-components";
import { useSuperlativesModel } from "../../headless/useSuperlatives";
import { Button } from "../ui/Button";
import { CaptainEmblem } from "../ui/CaptainEmblem";
import { ChevronDownIcon } from "../ui/icons";
import { Menu, MenuItem, MenuTrigger } from "../ui/Menu";
import { PlayerName } from "../tectonic/PlayerName";
import { SuperlativeGroupBox } from "./SuperlativeChrome";

const CLEAR_KEY = "__clear__";

/**
 * Superlative (CONTEXT.md) voting, in the Player's own Team area: one banner per category (SuperlativeGroupBox,
 * styled like the Titles page's rows), a dropdown to pick or change a teammate, and a passive "3 of 5 voted" hint.
 * Only ever shown for the viewer's own Team, and only while the Bingo is Live — outside that, `enabled` is false and
 * this renders nothing, same as a Bingo with no categories.
 */
export function TeamSuperlativesSection({ slug, enabled }: { slug: string; enabled: boolean }) {
  const model = useSuperlativesModel(slug, enabled);
  if (!enabled || model.isLoading || model.categories.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">Superlatives</h3>
      <div className="space-y-2">
        {model.categories.map((category) => (
          <SuperlativeGroupBox key={category.id} name={category.name}>
            <div className="flex items-center justify-between gap-3">
              <MenuTrigger>
                <Button variant="secondary" size="sm" className="min-w-0">
                  {category.pick ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <img src={category.pick.avatarUrl} alt="" className="size-5 shrink-0 rounded-full" />
                      <span className="truncate">{category.pick.displayName}</span>
                      {category.pick.isCaptain && <CaptainEmblem />}
                      {category.pick.isCoCaptain && <CaptainEmblem co />}
                    </span>
                  ) : (
                    "Pick a teammate"
                  )}
                  <ChevronDownIcon size={14} />
                </Button>
                <Menu
                  onAction={(key: Key) => {
                    if (key === CLEAR_KEY) model.clearPick(category.id);
                    else model.setPick(category.id, String(key));
                  }}
                >
                  {category.pick && (
                    <MenuItem id={CLEAR_KEY} variant="action">
                      Clear pick
                    </MenuItem>
                  )}
                  {model.teammates.map((teammate) => (
                    <MenuItem key={teammate.id} id={teammate.id}>
                      <img src={teammate.avatarUrl} alt="" className="size-5 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1 truncate">
                        <PlayerName userId={teammate.id}>{teammate.displayName}</PlayerName>
                      </span>
                      {teammate.isCaptain && <CaptainEmblem />}
                      {teammate.isCoCaptain && <CaptainEmblem co />}
                      {teammate.isMyDuoPartner && <span className="shrink-0 text-xs text-on-surface-subtle">Duo</span>}
                    </MenuItem>
                  ))}
                </Menu>
              </MenuTrigger>
              <span className="shrink-0 text-xs text-on-surface-subtle">{category.votedLabel}</span>
            </div>
          </SuperlativeGroupBox>
        ))}
      </div>
    </div>
  );
}

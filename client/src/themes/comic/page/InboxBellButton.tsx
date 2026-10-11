import { useState } from "react";
import { wikiIconUrl } from "../../../api/wikiIcons";
import { inboxBadgeText, inboxBellLabel, type InboxBellButtonProps } from "../../../core/notifications/InboxButton";
import { BellIcon } from "../../../core/ui/icons";
import { TextTooltip } from "../../../core/ui/Tooltip";
import { COMIC_FONT } from "../font";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";

/**
 * The header's bell as one of the masthead's ink buttons, a square beside the bug report button and dressed the same
 * way (yellow in a dark palette, paper in the light one): the wiki's Butler's bell sprite, as on the account menu's
 * Notifications row, falling back to core's BellIcon. While anything is unread the bell rings now and then, and the
 * count sits on its corner as a tilted red ink sticker in Bangers.
 */
export function InboxBellButton({ unread }: InboxBellButtonProps) {
  const { scheme, colors } = useComic();
  const [failed, setFailed] = useState(false);
  return (
    <TextTooltip text="Notifications">
      <ComicButton aria-label={inboxBellLabel(unread)} size="sm" variant={scheme === "dark" ? "yellow" : "secondary"} sfx={false} className="relative w-8 px-0!">
        <span className={`flex items-center justify-center ${unread > 0 ? "comic-bell-ring" : ""}`}>
          {failed ? (
            <BellIcon />
          ) : (
            <img src={wikiIconUrl("Butler's bell")} alt="" draggable={false} className="size-[22px] object-contain" onError={() => setFailed(true)} />
          )}
        </span>
        {unread > 0 && (
          <span
            aria-hidden
            className="num absolute -right-2.5 -top-2.5 min-w-5 rotate-[8deg] rounded-full border-2 px-1 text-center text-[13px] leading-4"
            style={{ fontFamily: COMIC_FONT, letterSpacing: "0.02em", background: colors.RED, color: colors.ON_LOUD, borderColor: colors.LINE, boxShadow: `2px 2px 0 ${colors.SHADOW}` }}
          >
            {inboxBadgeText(unread)}
          </span>
        )}
      </ComicButton>
    </TextTooltip>
  );
}

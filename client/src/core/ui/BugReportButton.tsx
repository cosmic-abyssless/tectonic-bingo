import { useState } from "react";
import { wikiIconUrl } from "../../api/wikiIcons";
import { IconButton } from "./Button";
import { PulseDot } from "./Card";
import { BugIcon } from "./icons";

export interface BugReportButtonProps {
  onPress: () => void;
  /** One of the viewer's reports was answered (or a new one filed) since they last looked: show the pulse dot. */
  hasUnseen: boolean;
}

/**
 * A little fun: the wiki's sprite for a Kalphite Queen head, in place of a literal bug icon for "report a bug", served
 * through our own icon cache. Falls back to BugIcon if the wiki ever moves or renames it, so the button never shows a
 * broken image. `className` sizes the sprite (30x25 at its own size).
 */
export function BugReportIcon({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <BugIcon />;
  return <img src={wikiIconUrl("Kq head")} alt="" draggable={false} className={`object-contain ${className ?? ""}`} onError={() => setFailed(true)} />;
}

/** The header's report-a-bug button (AppHeader wraps it in its tooltip). Themes can replace it: the BugReportButton slot. */
export function BugReportButton({ onPress, hasUnseen }: BugReportButtonProps) {
  return (
    <IconButton label="Report a bug" size="sm" className="relative" onPress={onPress}>
      <span className="flex size-5 items-center justify-center rounded-sm bg-icon-backdrop">
        <BugReportIcon className="size-4" />
      </span>
      {hasUnseen && <PulseDot className="-right-0.5 -top-0.5" />}
    </IconButton>
  );
}

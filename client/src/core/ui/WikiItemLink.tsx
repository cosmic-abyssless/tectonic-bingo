import type { ReactNode } from "react";
import { wikiPageUrl } from "../../api/wikiIcons";
import { INTERACTIVE_TEXT } from "./interactiveText";

/**
 * An item's name that opens it on the OSRS Wiki in a new tab, marked like a player's name (INTERACTIVE_TEXT). Safe
 * for any item name: one with no wiki page (a bingo-specific label) lands on the wiki's search instead.
 */
export function WikiItemLink({ name, children, className = "" }: { name: string; children?: ReactNode; className?: string }) {
  return (
    <a
      href={wikiPageUrl(name)}
      target="_blank"
      rel="noreferrer"
      title={`Open ${name} on the OSRS Wiki`}
      // Items sit inside clickable rows and cards (a tile's task, a mod queue card): open the wiki, not those.
      onClick={(e) => e.stopPropagation()}
      className={`${INTERACTIVE_TEXT} ${className}`}
    >
      {children ?? name}
    </a>
  );
}

import { WikiIcon } from "./ItemIcon";

/**
 * Marks a team's captain or co-captain: the game's own moderator emblems from the wiki, the Jagex moderator's gold
 * crown for the captain and the player moderator's silver one for the co-captain. 13x11 pixel art, drawn at its own
 * size (or `scale` 2 for a big heading) so it stays crisp.
 */
export function CaptainEmblem({ co = false, scale = 1, className = "" }: { co?: boolean; scale?: 1 | 2; className?: string }) {
  const label = co ? "Co-captain" : "Captain";
  return (
    <span role="img" aria-label={label} title={label} className={`inline-flex shrink-0 ${className}`}>
      <WikiIcon
        name={co ? "Player moderator emblem" : "Jagex moderator emblem"}
        className={`${scale === 2 ? "h-[22px] w-[26px]" : "h-[11px] w-[13px]"} [image-rendering:pixelated]`}
      />
    </span>
  );
}

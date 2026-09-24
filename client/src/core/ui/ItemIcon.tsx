import { useState } from "react";
import { wikiIconUrl } from "../../api/wikiIcons";

/**
 * An item's wiki icon, shown before the item's name. Decorative (the name is
 * always printed next to it). Plenty of item names here are bingo-specific
 * labels with no wiki page, so when the icon doesn't exist it is replaced by an
 * empty slot of the same size — no broken-image box, and the names in a list
 * still line up with the ones that do have icons.
 */
export function ItemIcon({ url, className = "" }: { url: string | null | undefined; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url) return null;
  if (failedUrl === url) return <span aria-hidden className={`size-5 shrink-0 ${className}`} />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedUrl(url)}
      className={`size-5 shrink-0 object-contain ${className}`}
    />
  );
}

/**
 * Any OSRS item's wiki icon by its name, for decorating the UI itself (not a board's items, which come with their
 * iconUrl): served by our own cache like every item icon, and an empty slot if the wiki has none. `className` sizes it;
 * the icons are small pixel art, so draw them at their own size (or a whole multiple) with pixelated scaling.
 */
export function WikiIcon({ name, className }: { name: string; className?: string }) {
  return <ItemIcon url={wikiIconUrl(name)} className={className} />;
}

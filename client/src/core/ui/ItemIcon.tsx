import { useState } from "react";

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

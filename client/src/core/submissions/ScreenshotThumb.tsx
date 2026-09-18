import { ImageIcon } from "../ui/icons";
import { thumbUrl } from "../../api/imageVariants";

const SIZE = { sm: "size-12", md: "size-14" } as const;

/** Screenshot thumbnail that opens the full image in a new tab; placeholder when none. */
export function ScreenshotThumb({ url, size = "md" }: { url?: string; size?: keyof typeof SIZE }) {
  if (!url) {
    return (
      <div className={`${SIZE[size]} flex shrink-0 items-center justify-center rounded-md border border-outline bg-background text-on-surface-subtle`} aria-hidden>
        <ImageIcon size={14} />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0" title="View screenshot">
      <img src={thumbUrl(url)} alt="Submission screenshot" className={`${SIZE[size]} rounded-md border border-outline object-cover transition-colors hover:border-outline-strong`} />
    </a>
  );
}

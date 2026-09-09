import { ImageIcon } from "../ui/icons";

const SIZE = { sm: "size-12", md: "size-14" } as const;

/** Screenshot thumbnail that opens the full image in a new tab; placeholder when none. */
export function ScreenshotThumb({ url, size = "md" }: { url?: string; size?: keyof typeof SIZE }) {
  if (!url) {
    return (
      <div className={`${SIZE[size]} flex shrink-0 items-center justify-center rounded-md border border-line bg-bg text-fg-subtle`} aria-hidden>
        <ImageIcon size={14} />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0" title="View screenshot">
      <img src={url} alt="Submission screenshot" className={`${SIZE[size]} rounded-md border border-line object-cover transition-colors hover:border-line-strong`} />
    </a>
  );
}

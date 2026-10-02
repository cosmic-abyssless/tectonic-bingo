import { SCREENSHOT_NOT_UPLOADED } from "@bingo/shared";
import type { CSSProperties, ReactNode } from "react";
import { ImageIcon } from "../ui/icons";
import { thumbUrl } from "../../api/imageVariants";
import { TextTooltip, Tooltip } from "../ui/Tooltip";
import { useViewScreenshot } from "./screenshotViewer";

const SIZE = { sm: "size-12", md: "size-14" } as const;

/**
 * Screenshot thumbnail that opens the full image (see ScreenshotLink); placeholder when none. `pending`: a Historical Bingo's
 * screenshot still to be uploaded, which says so rather than showing a broken picture.
 */
export function ScreenshotThumb({ url, size = "md", pending = false }: { url?: string; size?: keyof typeof SIZE; pending?: boolean }) {
  if (!url || pending) {
    return (
      <Tooltip content={pending ? SCREENSHOT_NOT_UPLOADED : null}>
        <div
          className={`${SIZE[size]} flex shrink-0 items-center justify-center rounded-md border border-outline bg-background text-on-surface-subtle ${pending ? "border-dashed" : ""}`}
          {...(pending ? { role: "img", "aria-label": SCREENSHOT_NOT_UPLOADED } : { "aria-hidden": true })}
        >
          <ImageIcon size={14} />
        </div>
      </Tooltip>
    );
  }
  return (
    <ScreenshotLink href={url} className="shrink-0">
      <img src={thumbUrl(url)} alt="Submission screenshot" className={`${SIZE[size]} rounded-md border border-outline object-cover transition-colors hover:border-outline-strong`} />
    </ScreenshotLink>
  );
}

/**
 * A screenshot (its `children`, drawn however the screen likes) that opens the full image, with a tooltip saying so: in
 * the page's picture viewer on the board (screenshotViewer), elsewhere in a new tab. ScreenshotThumb is the standard
 * small one; screens that show it bigger or in their theme's frame use this.
 */
export function ScreenshotLink({
  href,
  tooltip = "View screenshot",
  className,
  style,
  children,
}: {
  href: string;
  tooltip?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const view = useViewScreenshot();
  if (view) {
    return (
      <TextTooltip text={tooltip}>
        <button type="button" onClick={() => view(href)} className={className} style={style}>
          {children}
        </button>
      </TextTooltip>
    );
  }
  return (
    <TextTooltip text={tooltip}>
      <a href={href} target="_blank" rel="noreferrer" className={className} style={style}>
        {children}
      </a>
    </TextTooltip>
  );
}

/**
 * A name in OSRS's own bold font (#270): yellow with the game's hard 1px black shadow, like the game's own overhead
 * name text — no background plate, so it can sit embedded right on a piece of Wrapped art; a soft CSS drop shadow on
 * top keeps it legible over busy art on either scheme. The font is a bitmap drawn on a 16-unit em, so it only ever
 * renders at 16px or 32px (whole pixels, never smoothly scaled). "md" steps up to 32px from the sm breakpoint.
 */
export function OsrsCaption({ children, size = "sm", className = "" }: { children: string; size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={`inline-block max-w-full truncate font-osrs leading-none font-normal tracking-normal text-osrs-name normal-case [text-shadow:0.0625em_0.0625em_0_#000] [filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.85))] ${
        size === "md" ? "text-[16px] sm:text-[32px]" : "text-[16px]"
      } ${className}`}
    >
      {children}
    </span>
  );
}

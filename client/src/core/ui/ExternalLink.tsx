import type { AnchorHTMLAttributes } from "react";

/**
 * A link to another site (Wise Old Man, the hiscores, Photopea): opens in a new tab, without telling that site where
 * the visitor came from. Underlined; colour comes from the text it sits in or `className`.
 */
export function ExternalLink({ className, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel"> & { href: string }) {
  return <a {...props} target="_blank" rel="noreferrer" className={`underline underline-offset-2 hover:text-on-surface ${className ?? ""}`} />;
}

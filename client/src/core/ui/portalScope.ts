/**
 * Where an overlay opened from `anchor` (a select's list, a confirm popover) is mounted, instead of at <body>: the
 * nearest element marked data-portal-scope (a surface that restyles the controls inside it, like the comic theme's
 * panels), else the theme root, whose CSS variables the overlay needs, else <body>. For react-aria's
 * UNSAFE_PortalProvider getContainer.
 */
export function portalScope(anchor: HTMLElement | null): HTMLElement {
  return anchor?.closest<HTMLElement>("[data-portal-scope]") ?? anchor?.closest<HTMLElement>("[data-theme]") ?? document.body;
}

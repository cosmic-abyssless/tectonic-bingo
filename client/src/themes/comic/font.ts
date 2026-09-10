// Loaded via a <link> in index.html. A font is a build-time asset like any
// other, so it's fine to load globally there — but *using* it stays scoped
// to this theme's own components, same as tokens.ts's colors; the shared,
// non-themeable index.css @theme block never references it.

// The general comic-lettering font — use this for any text in the comic
// theme that isn't the Tectonic logo band itself.
export const COMIC_FONT = '"Bangers", cursive';

// Specific to the Tectonic logo band on the book cover — kept separate
// from COMIC_FONT since that one's meant to change more freely as the rest
// of the theme's typography evolves, without touching the logo.
export const COMIC_LOGO_FONT = '"Sofia Sans Extra Condensed", sans-serif';

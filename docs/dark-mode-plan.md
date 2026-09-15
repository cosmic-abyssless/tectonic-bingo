# Light/dark mode + a real surface/on-surface token system

Status: approved, not yet implemented. Written to be executed phase-by-phase,
**committing after each phase**, by an implementer with no prior context on
this conversation — every phase below is self-contained.

## Context

The app currently has exactly one color palette, hardcoded in
`client/src/index.css`'s `@theme` block (`--color-bg: #09090b`,
`--color-fg: #fafafa`, etc., `html { color-scheme: dark; }`) — there is no
light mode, no `prefers-color-scheme` handling, and no `matchMedia` usage
anywhere in the client. This is orthogonal to the existing per-*bingo*
`client/src/themes/` system (default/comic), which swaps `tile`/`chrome`
tokens and slot components based on the `bingos.theme` DB column — that
system has no light/dark concept either; comic's current palette
(yellow/white/black) is a single static look.

We're adding a real light/dark/system toggle, global across the whole app
(mod, admin, login, bingo list included — not just per-bingo themed pages),
defaulting to the OS preference, overridable from the account menu in the
header. Comic gets an actual second palette for dark mode (a purple night
palette instead of yellow), since its current one is clearly light-oriented.
Default theme's chrome already has no explicit override (it relies on the
base app's own CSS), so it gets light/dark for free once the base app does.

Alongside this, the token system is being completed, not just renamed:

1. **Rename the fg-role tokens to a surface/on-surface pairing.** The
   reference here is Material Design 3's color-role system — every color a
   UI element sits *on* gets an explicit `on-X` partner naming the color used
   *on top of* it. We are **not** adopting the full M3 spec (~30 roles,
   including several — tertiary, containers, inverse-surface — with no analog
   anywhere in this app); we're adapting the pairing *pattern* to the roles
   this app actually has:

   | Old | New |
   |---|---|
   | `bg` | `background` |
   | `fg` | `onSurface` |
   | `fgMuted` | `onSurfaceMuted` |
   | `fgSubtle` | `onSurfaceSubtle` |
   | `accentFg` | `onAccent` |
   | `line` | `outline` |
   | `lineStrong` | `outlineStrong` |

   Unchanged: `surface`, `surfaceRaised`, `surfaceHover`, `accent`, `ok`,
   `warn`, `danger`, `info`, `borderWidth`, `headingFont`, `headingWeight` —
   these already read as clear, standalone names, or don't fit an "on-X"
   pairing (no code anywhere renders solid text-on-`ok`/`warn`/`danger`/`info`
   fills today — those are used as translucent tints/borders, not surfaces
   something sits "on").

2. **Add the token pairings that are genuinely missing.** Found by reading
   every `core/ui` component that renders a colored surface (`Button`,
   `Dialog`, `Card`/`Badge`/`Notice`, `Menu`, `Toast`, `Field`,
   `StatusBadge`) and by grepping for opacity-modified and raw
   (non-token) color usages across every `.tsx` file
   (`grep -rhoE "(bg|text|border|ring|outline|decoration|divide)-(black|white|accent|ok|warn|danger|info|fg|line)(/[0-9]+)?"`),
   which surfaces exactly the spots reaching for a color outside the token
   system instead of using (or missing) a proper role:
   - **`button` / `onButton` and `buttonSecondary` / `onButtonSecondary`** —
     `client/src/core/ui/Button.tsx`'s primary and secondary variants
     currently reach into the generic `accent`/`onAccent` and
     `surfaceRaised`/`onSurface` tokens directly — there's no dedicated
     "this is a button" role, so a theme can't style buttons distinctly from
     e.g. a focus ring or a link without also changing those. Initial values
     identical to what they already resolve to today (zero visual change).
     `ghost`/`danger` variants are already correctly modeled as
     transparent/tinted treatments over existing generic tokens
     (`surfaceHover`, `danger`) — they don't need their own roles; only
     variants with a real *filled surface* need one.
   - **`scrim`** — `client/src/core/ui/Dialog.tsx:36` and comic's
     `themes/comic/board/TileModal.tsx:45` both hardcode `bg-black/70` for
     the modal backdrop; this is a real, standard role (Material Design 3
     has this exact one, literally named "scrim") that the app is just
     missing. A scrim conventionally stays the same dark value regardless of
     the page's own light/dark scheme (dimming whatever's behind it is the
     whole point, on either background) — one value, no light/dark variant
     needed, unlike every other new/renamed token here.
   - **Confirmed NOT gaps, checked rather than assumed**: `Notice`/`Badge`'s
     `ok`/`warn`/`danger`/`info` tones (`core/ui/Card.tsx`'s `TONE` map) are
     border+text only, never a solid fill with text on top — no
     `onOk`/`onWarn`-style pairing needed. `StatusBadge.tsx`'s `TASK_STATUS_DOT`
     solid-fill dots (`bg-warn`/`bg-info`/`bg-ok`) are plain circles with
     nothing rendered on top of them. Links (`Markdown.tsx`, several
     `pages/*`) deliberately reuse `text-fg`/underline rather than a
     dedicated link color. Form inputs (`Field.tsx`) already compose cleanly
     from existing generic tokens. None of these need new roles.

3. **Audit and fix hardcoded colors that would otherwise ignore the new dark
   mode.** Found via `grep -rlnE "#[0-9a-fA-F]{3,8}\b" client/src --include=*.ts --include=*.tsx`
   plus the raw-Tailwind-neutral grep above, excluding the token-definition
   files themselves:
   - **Legitimate, leave alone** (confirmed with the user): `core/admin/CategoryEditor.tsx`
     and `core/admin/TeamManager.tsx`'s color-picker defaults (`#6366f1`,
     `#64748b`) — user-assignable category/team colors, not theme colors.
     `pages/Login.tsx`'s `#5865F2`/`#4752c4` — Discord's own brand blurple for
     the "Continue with Discord" button; must stay fixed regardless of app
     theme. `themes/comic/useDominantColor.ts`'s `#000000`/`#ffffff` — a
     WCAG-luminance contrast pick for text color *on an extracted tile-image
     color*, not a theme color. `core/mod/ReviewQueue.tsx`'s `bg-black`
     screenshot-preview letterbox — a photo-viewer matte, conventionally
     fixed black regardless of page theme. **Do not touch any of these.**
   - **Real gaps, fixed in Phase 4**: `themes/comic/dotGrid.ts`'s halftone
     dots are a hardcoded `#00000080` (semi-transparent black) — invisible
     against comic-dark's purple background. `themes/comic/board/TileCell.tsx`'s
     `coverColor` fallback and two parchment-gradient shades (`#ffead4`,
     `#e6d9b8`, `#f2ead4`) are comic-*light*-specific paper-texture art
     direction that would look wrong under comic-dark, as is its freeze-badge
     label's raw `text-black`. `themes/comic/board/TileModal.tsx` turns out to
     have its **own separate, undocumented hardcoding**, distinct from
     `colors.ts` below — a local `PAGE_BG = "#f2ead4"` / `BORDER_COLOR = "#000000"`
     pair (same portal reasoning, just never consolidated into the shared
     file), plus several raw Tailwind `bg-white`/`text-black`/`border-black`
     classes on the close button and submission-bubble chrome (confirmed
     with the user: these should shift to a dark parchment tone in
     comic-dark, not stay literal white paper). `themes/comic/board/colors.ts`
     (`INK`, `INK_BODY`, `GREEN`, `BLUE`, `ORANGE`, etc.) is **already**
     deliberately hardcoded, for a real structural reason its own file
     comment documents: `TaskPanel`/`TileModal`/`RequirementTree`/`SubmissionBubble`
     render through a react-aria `Popover`/`Modal` portal, which mounts at
     the end of `<body>` — **outside** the DOM subtree `ThemeProvider` sets
     its CSS custom properties on, so `var(--color-x)` doesn't resolve
     there. Confirmed via the installed `react-aria-components@1.21.1`'s
     type defs (`node_modules/react-aria-components/dist/types/exports/{Modal,Popover}.d.ts`)
     that there's no portal-container override API in this version (no
     `UNSTABLE_PortalProvider`/`portalContainer` prop) — re-architecting
     around that is a separate, riskier task, **out of scope here**. The fix
     is to extend `colors.ts` with light *and* dark values for everything
     above (consolidating `TileModal.tsx`'s separate local constants and raw
     Tailwind classes into it too, closing that second hardcoding pattern)
     and have every portaled/decorative consumer pick between them via the
     same scheme hook everything else uses — the portal boundary no longer
     means "frozen at one scheme forever," even though the values stay
     literal hex.

Researched by reading, in full, the current `index.css`,
`themes/{tokens,registry,ThemeProvider,context}.ts`, `themes/default/index.ts`,
`themes/comic/index.ts`, `AppHeader.tsx`, and `core/ui/preferences.ts`, plus
an exact grep enumeration of every real Tailwind-class occurrence of the 7
renamed tokens (≈493 occurrences across 81 files) and every false-positive
trap to avoid.

## Acceptance bar

- Toggling Light / Dark / System from the account menu instantly re-skins
  every page — bingo list, mod panel (incl. audit log), site admin, and every
  themed bingo page (board, draft, stats) in both `default` and `comic` — with
  no reload.
- "System" tracks the OS/browser `prefers-color-scheme` live, with no reload,
  and is the default for a user who's never chosen otherwise.
- Reloading the page after picking an explicit Light or Dark shows that
  scheme immediately — no flash of the other one.
- A comic-themed bingo's board, draft, and stats pages, and an open tile's
  modal (task panel, requirement tree, submission bubbles, the book-page
  parchment and speech-bubble chrome), all switch from the
  yellow/cream/white/black daytime look to the new
  purple/lavender/dark-parchment/gold night look together — nothing stays
  frozen on the old palette.
- Every modal's backdrop (`Dialog.tsx` and comic's `TileModal.tsx`) uses the
  new `scrim` token instead of raw black, and looks the same as it does
  today in both schemes (scrim doesn't change with light/dark).
- A default-themed bingo, and every non-bingo-scoped page, look **exactly**
  as they do today when the resolved scheme is Dark (this is a rename +
  additive feature, not a redesign of the existing dark look).
- `npx tsc --noEmit` in `client/` is clean after every phase.
- No `server/` file changes anywhere in this doc.

## Must not change

- Anything under `server/`.
- `themes/comic/board/colors.ts`'s `ORANGE_LINE` constant, or any file's
  `eslint-disable-next-line` comments, `repeating-linear-gradient` CSS
  values, or SVG `<line>` elements — these are false-positive matches for the
  token-rename grep, not real token usages (see Phase 1).
- `--tile-bg` / `ThemeTokens.tile.bg` / `defaultTokens.*.tile.bg` /
  `bg-[var(--tile-bg)]` — an unrelated per-board-theme tile color, not the
  `bg`→`background` token being renamed.
- The four "legitimate, leave alone" hardcoded colors listed in Context
  item 3 (category/team color pickers, Discord brand color, dominant-color
  luminance contrast pick, `ReviewQueue.tsx`'s screenshot-preview matte).
- Any slot *component* file (`BoardPageLayout.tsx`, every file under
  `themes/default/**` and `themes/comic/**` other than the ones named in
  Phase 3/4 — `themes/comic/index.ts`, `dotGrid.ts`, `board/TileCell.tsx`,
  `board/colors.ts`, `board/TaskPanel.tsx`, `board/TileModal.tsx`,
  `board/RequirementTree.tsx`, `board/SubmissionBubble.tsx`) — the
  light/dark axis is designed so that no *other* slot component needs to
  know schemes exist at all. If a phase below seems to require editing one
  outside this list, stop and re-read Phase 3 — it's very likely not
  necessary.

---

## Phase 1 — Token rename (mechanical, zero visual change)

Rename the 7 tokens from the Context table everywhere: CSS var names in
`index.css`, the `chromeVarByKey` map and `ThemeTokens.chrome` interface in
`client/src/themes/tokens.ts`, the hex value object in
`client/src/themes/comic/index.ts`, and every Tailwind class / `var()` usage
across ~80 other files (breakdown from the research grep: `core/ui` 19,
`core/admin` 14, `themes/default/page` 9, `themes/default/board` 7,
`themes/comic/page` 5, `themes/default/submission` 4, `pages` 4, `core/mod`
4, `core/draft` 3, `themes/comic/board` 2, `core/submissions` 2,
`core/signup` 2, `core/teams` 1, `core/stats` 1, plus `index.css`).

Do this as a scripted replacement (write a short Node or Python script, or a
carefully ordered sequence of `sed -i` invocations over the matched file
list) — not manual per-file edits, the volume is too large to do reliably by
hand. Use **literal compound-string replacements** in this exact order
(several tokens are substrings of others, so order matters):

1. `accent-fg` → `on-accent` (covers `text-accent-fg`, `text-accent-fg/70`,
   `bg-accent-fg`, `group-selected:bg-accent-fg`, `--color-accent-fg`)
2. `fg-muted` → `on-surface-muted` (covers `text-fg-muted`,
   `hover:text-fg-muted`, `var(--color-fg-muted)`, `--color-fg-muted`)
3. `fg-subtle` → `on-surface-subtle` (covers `text-fg-subtle`,
   `bg-fg-subtle`, `bg-fg-subtle/50`, `placeholder:text-fg-subtle`,
   `--color-fg-subtle`)
4. `line-strong` → `outline-strong` (covers `border-line-strong`,
   `hover:border-line-strong`, `bg-line-strong`, `decoration-line-strong`,
   `var(--color-line-strong)`, `--color-line-strong`)
5. Bare `fg` (word-boundary) → `on-surface` (covers `text-fg`,
   `border-fg`(`/60`), `bg-fg`, `hover:bg-fg`, `selected:after:bg-fg`,
   `outline-fg/80`, `decoration-fg`, `placeholder:text-fg`, `hovered:text-fg`,
   `selected:text-fg`, `hover:text-fg`, `focus:text-fg`, `var(--color-fg)`,
   `--color-fg`)
6. Bare `line` (word-boundary) → `outline` (covers `border-line`,
   `divide-line`, `bg-line`, `var(--color-line)`, `--color-line`) —
   **exclude** `eslint-disable-next-line`, `repeating-linear-gradient`,
   `ORANGE_LINE`, the SVG `<line>` tag, and the "~3-line snippet" comment in
   `themes/registry.ts`
7. Bare `bg` where it's the color token, not the Tailwind utility prefix —
   only the literal compound forms `bg-bg`, `bg-bg/70`, `bg-bg/80`,
   `text-bg`, `var(--color-bg)`, `--color-bg` → the `background` equivalents
   — **exclude** `--tile-bg`, `tokens.tile.bg`, `bg-[var(--tile-bg)]`

Then, separately, the **TypeScript identifier** rename (object property
names, not strings) in exactly two files:

- `client/src/themes/tokens.ts` — `ThemeTokens.chrome`'s 7 property names
  (`bg`→`background`, `line`→`outline`, `lineStrong`→`outlineStrong`,
  `fg`→`onSurface`, `fgMuted`→`onSurfaceMuted`, `fgSubtle`→`onSurfaceSubtle`,
  `accentFg`→`onAccent`), and `chromeVarByKey`'s keys+string values in
  lockstep.
- `client/src/themes/comic/index.ts` — the `chrome` value object's same 7
  property names.

Rewrite `client/src/index.css`'s `@theme` block property names (values
**unchanged** at this phase) and the 3 `@apply` lines in `@layer base`:
`bg-bg text-fg` → `bg-background text-on-surface`; `border-line` →
`border-outline`; `outline-fg/80` → `outline-on-surface/80`.

**Verification** (run all of these; every one must pass before committing):
```
cd client
npx tsc --noEmit
grep -rn "text-fg\b\|border-fg\b\|bg-fg\b\|outline-fg/80\|decoration-fg\b\|hovered:text-fg\|selected:text-fg" src   # expect 0 hits
grep -rn "text-fg-muted\|text-fg-subtle\|text-accent-fg\|bg-accent-fg" src                                          # expect 0 hits
grep -rn "border-line\b\|divide-line\b\|border-line-strong\b" src                                                   # expect 0 hits (ORANGE_LINE, eslint-disable-next-line, repeating-linear-gradient, <line> tags are fine to still show up if your grep is broader than this)
grep -rn "bg-bg\b\|text-bg\b" src                                                                                    # expect 0 hits except bg-[var(--tile-bg)] (leave those)
grep -rn "\-\-color-bg\b\|\-\-color-fg\b\|\-\-color-line\b" src                                                      # expect 0 hits except --tile-bg
```
Then a live browser pass (dev server is already running — do not start a
competing one) across: BingoList, ModPage (+ audit log tab), SiteAdminPage,
a board page in both `default` and `comic` themes, Draft/Stats pages in both
themes, a submission modal, the signup form. Confirm **zero visual
difference** from before this phase (it's a pure rename) and no console
errors on any of them.

**Commit this phase before starting Phase 2.**

---

## Phase 2 — Light/dark toggle infrastructure + new button/scrim tokens

Comic is intentionally **not** given a real dark palette yet in this phase —
its `dark` tokens are set equal to its `light` tokens, so the toggle
mechanism itself can be verified in isolation before Phase 3 changes how
comic actually looks.

### 2a. `client/src/index.css`

Add a light palette as the base `@theme` values, move the *current* (Phase 1
renamed, value-unchanged) values into dark-scheme override blocks, add the
two new button-role token pairs, and add `scrim` (a single value, no
light/dark split — see Context item 2). Current full file content — rewrite
`@theme` and the 3 `@apply` lines in `@layer base` per below; everything
else in the file (`@custom-variant`, `@layer utilities`, the animation
`@media`/`@keyframes` block) is untouched:

```css
@theme {
  --color-background: #fafafa;
  --color-surface: #ffffff;
  --color-surface-raised: #f4f4f5;
  --color-surface-hover: #e4e4e7;

  --color-outline: #e4e4e7;
  --color-outline-strong: #d4d4d8;

  --color-on-surface: #18181b;
  --color-on-surface-muted: #71717a;
  --color-on-surface-subtle: #a1a1aa;

  --color-accent: #18181b;
  --color-on-accent: #fafafa;

  --color-button: #18181b;
  --color-on-button: #fafafa;
  --color-button-secondary: #f4f4f5;
  --color-on-button-secondary: #18181b;

  --color-ok: #16a34a;
  --color-warn: #b45309;
  --color-danger: #dc2626;
  --color-info: #2563eb;

  --color-scrim: #000000; /* modal backdrop — same in both schemes, not overridden below */

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;

  --shadow-pop: 0 0 0 1px rgb(0 0 0 / 0.6), 0 8px 24px -8px rgb(0 0 0 / 0.7), 0 24px 48px -16px rgb(0 0 0 / 0.6);

  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-color-scheme="light"]) {
    --color-background: #09090b;
    --color-surface: #101012;
    --color-surface-raised: #17171a;
    --color-surface-hover: #1c1c20;
    --color-outline: #232327;
    --color-outline-strong: #34343a;
    --color-on-surface: #fafafa;
    --color-on-surface-muted: #a1a1aa;
    --color-on-surface-subtle: #6b6b74;
    --color-accent: #e4e4e7;
    --color-on-accent: #09090b;
    --color-button: #e4e4e7;
    --color-on-button: #09090b;
    --color-button-secondary: #17171a;
    --color-on-button-secondary: #fafafa;
    --color-ok: #4ade80;
    --color-warn: #fbbf24;
    --color-danger: #f87171;
    --color-info: #60a5fa;
    color-scheme: dark;
  }
}
:root[data-color-scheme="dark"] {
  --color-background: #09090b;
  --color-surface: #101012;
  --color-surface-raised: #17171a;
  --color-surface-hover: #1c1c20;
  --color-outline: #232327;
  --color-outline-strong: #34343a;
  --color-on-surface: #fafafa;
  --color-on-surface-muted: #a1a1aa;
  --color-on-surface-subtle: #6b6b74;
  --color-accent: #e4e4e7;
  --color-on-accent: #09090b;
  --color-button: #e4e4e7;
  --color-on-button: #09090b;
  --color-button-secondary: #17171a;
  --color-on-button-secondary: #fafafa;
  --color-ok: #4ade80;
  --color-warn: #fbbf24;
  --color-danger: #f87171;
  --color-info: #60a5fa;
  color-scheme: dark;
}
```

In `@layer base`, change `html { color-scheme: dark; }` to
`html { color-scheme: light; }` (the two override blocks above set it back
to `dark` when applicable). Everything else in `@layer base` is unchanged
(the `@apply bg-background text-on-surface` / `@apply border-outline` /
`@apply outline-2 outline-offset-2 outline-on-surface/80` lines from Phase 1
stay as they are — they reference the token names, not literal values, so
they automatically pick up whichever scheme is active).

`ok`/`warn`/`danger`/`info` in the new light palette are darkened from the
vibrant dark-surface defaults, for contrast against light surfaces — the
exact same reasoning `themes/comic/index.ts`'s existing comment already gives
for why *its* light palette does the same thing.

### 2b. `client/src/core/ui/Button.tsx` and `client/src/core/ui/Dialog.tsx`

In `Button.tsx`, change the `primary` variant's classes from `bg-accent
text-accent-fg hover:bg-fg border-transparent` (post—Phase-1-rename:
`bg-accent text-on-accent hover:bg-on-surface border-transparent`) to
`bg-button text-on-button hover:bg-on-surface border-transparent`. Change
`secondary` from `bg-surface-raised text-fg hover:bg-surface-hover
border-line-strong` (post-rename: `bg-surface-raised text-on-surface
hover:bg-surface-hover border-outline-strong`) to `bg-button-secondary
text-on-button-secondary hover:bg-surface-hover border-outline-strong`.
`ghost` and `danger` variants are unchanged.

In `Dialog.tsx`, change the `ModalOverlay`'s `bg-black/70` to `bg-scrim/70`
(same visual result — `--color-scrim` is `#000000` in both schemes — but
now token-backed instead of a raw hardcoded color).

### 2c. `client/src/core/ui/preferences.ts`

Add one line to the `PREFERENCES` object: `colorScheme: ["system", "light", "dark"]`
(first entry is the default, matching this file's existing convention — so
"system" is the default with zero other code needed for that requirement).

### 2d. New `client/src/core/ui/colorScheme.ts`

```ts
import { useSyncExternalStore, useEffect } from "react";
import { usePreference } from "./preferences";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemScheme(onChange: () => void) {
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
function readSystemScheme(): "light" | "dark" {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** The user's raw "system" | "light" | "dark" choice, and a setter — for the appearance menu. */
export function useColorSchemePreference() {
  return usePreference("colorScheme");
}

/** The concrete "light" | "dark" scheme in effect right now — resolves "system" via the live OS preference. */
export function useResolvedColorScheme(): "light" | "dark" {
  const [preference] = usePreference("colorScheme");
  const systemScheme = useSyncExternalStore(subscribeToSystemScheme, readSystemScheme);
  return preference === "system" ? systemScheme : preference;
}

/** Keeps <html data-color-scheme> in sync with the raw preference — call once at the app root. */
export function useSyncColorSchemeAttribute(): void {
  const [preference] = usePreference("colorScheme");
  useEffect(() => {
    if (preference === "system") document.documentElement.removeAttribute("data-color-scheme");
    else document.documentElement.setAttribute("data-color-scheme", preference);
  }, [preference]);
}
```

### 2e. `client/src/App.tsx`

Call `useSyncColorSchemeAttribute()` once, at the top of the `App()`
function body (before the returned JSX) — no wrapper component needed.

### 2f. `client/index.html`

Add a synchronous inline `<script>` in `<head>`, placed before any
stylesheet `<link>`/module `<script>`, to prevent a flash of the wrong
scheme on first paint (React-driven attribute-setting from 2e only runs
after the JS bundle loads and hydrates, which is too late to avoid a flash):

```html
<script>
  try {
    var p = localStorage.getItem("pref:colorScheme");
    if (p === "light" || p === "dark") document.documentElement.setAttribute("data-color-scheme", p);
  } catch (e) {}
</script>
```

This must match `core/ui/preferences.ts`'s exact storage format — confirmed
by reading that file: plain string value via `localStorage.setItem("pref:" + key, next)`,
no JSON encoding.

### 2g. Theme system restructuring

`tokens` and `slots` stay conceptually separate; only `tokens` gains a
light/dark axis. **No slot component file changes at all** — they only ever
consume a plain, already-resolved-for-the-current-scheme `ThemeTokens` via
`useThemeTokens()`, exactly as today.

**`client/src/themes/tokens.ts`** — add the button fields to
`ThemeTokens.chrome`, and change `defaultTokens`'s shape from a single
`ThemeTokens` to a `{ light, dark }` pair (reuse one shared `tile` object for
both, since default's board-tile colors don't change per scheme — only the
CSS-cascade-driven chrome does):

```ts
export interface ThemeTokens {
  tile: { bg: string; border: string; empty: string; accent: string; complete: string; frozen: string };
  chrome?: Partial<{
    background: string; surface: string; surfaceRaised: string; surfaceHover: string;
    outline: string; outlineStrong: string;
    onSurface: string; onSurfaceMuted: string; onSurfaceSubtle: string;
    accent: string; onAccent: string;
    button: string; onButton: string; buttonSecondary: string; onButtonSecondary: string;
    ok: string; warn: string; danger: string; info: string;
    borderWidth: string; headingFont: string; headingWeight: string;
  }>;
}

export interface SchemeTokens {
  light: ThemeTokens;
  dark: ThemeTokens;
}

const DEFAULT_TILE = { bg: "#101012", border: "#232327", empty: "#0c0c0e", accent: "#a1a1aa", complete: "#4ade80", frozen: "#60a5fa" };

export const defaultTokens: SchemeTokens = {
  light: { tile: DEFAULT_TILE },
  dark: { tile: DEFAULT_TILE },
};

export function tokensToCssVars(tokens: ThemeTokens): CSSProperties {
  // same body as today, but chromeVarByKey gains:
  //   background: "--color-background", outline: "--color-outline", outlineStrong: "--color-outline-strong",
  //   onSurface: "--color-on-surface", onSurfaceMuted: "--color-on-surface-muted", onSurfaceSubtle: "--color-on-surface-subtle",
  //   onAccent: "--color-on-accent",
  //   button: "--color-button", onButton: "--color-on-button", buttonSecondary: "--color-button-secondary", onButtonSecondary: "--color-on-button-secondary",
  // (bg/line/lineStrong/fg/fgMuted/fgSubtle/accentFg keys from Phase 1 are already gone/renamed)
}
```

**`client/src/themes/registry.ts`** — `ThemeDefinition.tokens` and
`ResolvedTheme` change shape; `mergeTheme` merges each scheme independently.
`ResolvedTheme` is currently `type ResolvedTheme = ThemeContextValue` (an
alias) — it must become its **own** interface, decoupled from
`ThemeContextValue` (which stays single-scheme, since that's what a
component consumes via `useThemeTokens()`):

```ts
export interface ThemeDefinition {
  key: string;
  tokens?: { light?: Partial<ThemeTokens>; dark?: Partial<ThemeTokens> };
  slots?: Partial<ThemeSlots>;
}

export interface ResolvedTheme {
  key: string;
  tokens: { light: ThemeTokens; dark: ThemeTokens };
  slots: ThemeSlots;
}

const DEFAULT_RESOLVED: ResolvedTheme = { key: defaultTheme.key, tokens: defaultTokens, slots: defaultTheme.slots as ThemeSlots };

function mergeSchemeTokens(base: ThemeTokens, def?: Partial<ThemeTokens>): ThemeTokens {
  return { tile: { ...base.tile, ...def?.tile }, chrome: { ...base.chrome, ...def?.chrome } };
}

export function mergeTheme(base: ResolvedTheme, def: ThemeDefinition): ResolvedTheme {
  return {
    key: def.key,
    tokens: {
      light: mergeSchemeTokens(base.tokens.light, def.tokens?.light),
      dark: mergeSchemeTokens(base.tokens.dark, def.tokens?.dark),
    },
    slots: { ...base.slots, ...def.slots },
  };
}
```
Everything else in `registry.ts` (`isKnownTheme`, `resolveTheme`'s caching —
still keyed by theme `key` alone, since slots don't vary by scheme and both
schemes' tokens are resolved together — `onThemeHmrUpdate`,
`pushThemeHmrUpdate`) is unchanged; they operate on `ResolvedTheme`/`ThemeDefinition`
generically and don't need to know their internal shape changed.

**`client/src/themes/ThemeProvider.tsx`** — resolve the active scheme and
pick that scheme's tokens before constructing the context value:

```tsx
import { useResolvedColorScheme } from "../core/ui/colorScheme";
// ...
export function ThemeProvider({ themeKey, children }: { themeKey: string; children: ReactNode }) {
  const scheme = useResolvedColorScheme();
  const [resolved, setResolved] = useState<ResolvedTheme>(/* unchanged resolution logic */);
  // ...unchanged effects...

  const activeTokens = resolved.tokens[scheme];
  return (
    <ThemeContext.Provider value={{ key: resolved.key, tokens: activeTokens, slots: resolved.slots }}>
      <div data-theme={resolved.key} style={tokensToCssVars(activeTokens)}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
```
`themes/context.ts` is **unchanged** — `ThemeContextValue.tokens` was always
a plain `ThemeTokens` and still is.

**`client/src/themes/default/index.ts`** — no change needed. `tokens: defaultTokens`
already matches the new `{light,dark}` shape once `defaultTokens` itself is
updated per above.

**`client/src/themes/comic/index.ts`** — wrap the current `tile`/`chrome`
object under `light:` (values unchanged from Phase 1's renamed-but-not-yet-restructured
state), add the two new button-role fields to `chrome` (comic's existing
effective button look, made explicit: primary button = comic's blue accent,
secondary = comic's `surfaceRaised`/`onSurface`), and set `dark:` to the
same object as `light:` for now (Phase 3 gives it real values):

```ts
const comicTile = { bg: "#f3ebd9", border: "#000000", empty: "#e8e2d3", accent: "#f97316", complete: "#22c55e", frozen: "#38bdf8" };
const comicChromeLight = {
  background: "#ffc526", surface: "#ffffff", surfaceRaised: "#fff4d6", surfaceHover: "#dbeafe",
  outline: "#000000", outlineStrong: "#000000",
  onSurface: "#000000", onSurfaceMuted: "#57534e", onSurfaceSubtle: "#78716c",
  accent: "#2563eb", onAccent: "#ffffff",
  button: "#2563eb", onButton: "#ffffff", buttonSecondary: "#fff4d6", onButtonSecondary: "#000000",
  ok: "#15803d", warn: "#92400e", danger: "#b91c1c", info: "#1d4ed8",
  borderWidth: "2px", headingFont: COMIC_FONT, headingWeight: "400",
};

const comicTheme: ThemeDefinition = {
  key: "comic",
  tokens: {
    light: { tile: comicTile, chrome: comicChromeLight },
    dark: { tile: comicTile, chrome: comicChromeLight }, // placeholder — Phase 3 replaces this
  },
  slots: { /* unchanged */ },
};
```

### 2h. New icons

In `client/src/core/ui/icons.tsx`, add `SunIcon`, `MoonIcon`, `MonitorIcon`
(or similar names), following the file's existing simple stroke-SVG
component convention (read a couple of the existing icons in that file
first to match the exact prop signature / `viewBox` / stroke-width style).

### 2i. `client/src/core/ui/AppHeader.tsx`

Add an "Appearance" section to the account menu (the existing `<Menu>` that
already has "Site admin" and "Log out") — three plain `MenuItem`s, "Light",
"Dark", "System", each with `onAction={() => setColorScheme("light" | "dark" | "system")}`
(from `useColorSchemePreference()`), showing the existing `CheckIcon` next
to whichever currently matches the preference value. Not a `selectionMode`
radio-group or a submenu — react-aria's `Menu` selection mode applies to the
whole menu, and this needs to coexist with the plain-action "Site admin" /
"Log out" items already in it; three checkable action items is simpler,
matches this codebase's existing single-item-with-trailing-state precedent
in `ModPage.tsx`'s `menuItems` usage, and needs no new component.

**Verification**:
```
cd client && npx tsc --noEmit
```
Then, live in the browser (dev server already running):
- Toggle Light / Dark / System from the menu on BingoList, ModPage,
  SiteAdminPage, and a default-themed board page. Confirm the whole app
  responds instantly, no reload, and every button still looks right (new
  tokens, same values as before this phase).
- Confirm "System" tracks the OS/browser color-scheme setting (use Chrome
  DevTools' rendering panel to emulate `prefers-color-scheme` and confirm it
  updates live with no reload).
- Confirm a comic-themed board/draft/stats page is **pixel-identical** in
  both Light and Dark right now (comic's dark tokens = light tokens at this
  phase).
- Reload the page after picking an explicit Light or Dark; confirm no flash
  of the wrong scheme.
- Console-error check on all of the above.

**Commit this phase before starting Phase 3.**

---

## Phase 3 — Comic's dark palette

Add real dark values to `themes/comic/index.ts`'s `tokens.dark` — a "moonlit
comic panel" palette: deep purple night instead of yellow paper, pale
lavender ink instead of black ink, a gold accent instead of blue (blue reads
muddy against purple; gold pops the way a comic "POW!" burst would, and
doubles as the button color). Reuses `index.css`'s *original* vibrant
`ok`/`warn`/`danger`/`info` values (comic-light only darkened them for its
pale surfaces — a dark surface can use the punchy versions directly, the
same logic in reverse).

```ts
const comicTileDark = {
  bg: "#2e1d4f",       // filled tile
  border: "#e9d5ff",   // pale lavender ink line
  empty: "#1f1338",
  accent: "#facc15",   // gold, matches chrome accent
  complete: "#22c55e", // unchanged — green still reads fine on purple
  frozen: "#38bdf8",   // unchanged — blue still reads fine on purple
};
const comicChromeDark = {
  background: "#1a0f2e",
  surface: "#241640",
  surfaceRaised: "#2e1d4f",
  surfaceHover: "#3a2760",
  outline: "#c4b5fd",
  outlineStrong: "#e9d5ff",
  onSurface: "#f5f0ff",
  onSurfaceMuted: "#c4b5fd",
  onSurfaceSubtle: "#8b7aa8",
  accent: "#facc15",
  onAccent: "#1a0f2e",
  button: "#facc15",
  onButton: "#1a0f2e",
  buttonSecondary: "#2e1d4f",
  onButtonSecondary: "#f5f0ff",
  ok: "#4ade80", warn: "#fbbf24", danger: "#f87171", info: "#60a5fa",
  borderWidth: "2px",
  headingFont: COMIC_FONT,
  headingWeight: "400",
};
// tokens.dark = { tile: comicTileDark, chrome: comicChromeDark }
```

These are a first-pass proposal — adjust hue/saturation after seeing it
live if it doesn't read well; don't treat the exact hex values as gospel.

**Verification**: toggle a comic-themed bingo (board, draft, stats) between
Light and Dark. Confirm the yellow→purple swap reads well: header, buttons,
badges, Card panels, the halftone dot-grid background (still using the
Phase-1/2 hardcoded `#00000080` dots at this point — **expected to look
wrong here**, that's Phase 4's job, not a regression to fix now), the
points-over-time chart line and heatmap in Stats (these use the
token-based fallback color from a prior contrast fix and should follow
automatically). Console-error check; `npx tsc --noEmit`.

**Commit this phase before starting Phase 4.**

---

## Phase 4 — Close the hardcoded-color gaps

Using the same `useResolvedColorScheme()` hook from Phase 2:

**`client/src/themes/comic/dotGrid.ts`** — the halftone dot color becomes a
light/dark pair instead of one fixed value:
```ts
import { useResolvedColorScheme } from "../../core/ui/colorScheme";

export function useDotGridStyle(): CSSProperties {
  const scheme = useResolvedColorScheme();
  const dot = scheme === "dark" ? "#c4b5fd66" : "#00000080";
  return {
    backgroundColor: "var(--color-background)",
    backgroundImage: `radial-gradient(${dot}, 15%, transparent 16%), radial-gradient(${dot}, 15%, transparent 16%)`,
    backgroundSize: "14px 14px",
    backgroundPosition: "0 0, 7px 7px",
    position: "relative",
    zIndex: 1,
  };
}
```
(Was a plain exported `DOT_GRID_STYLE` constant; becomes a hook since the
value now depends on the resolved scheme. Update its three call sites —
`themes/comic/page/BoardPageLayout.tsx`, `DraftPageLayout.tsx`,
`StatsPageLayout.tsx` — from `style={DOT_GRID_STYLE}` to
`style={useDotGridStyle()}`, importing the hook instead of the constant.)

**`client/src/themes/comic/board/colors.ts`** — extend with `dark`
counterparts for everything already there, **plus new `PAPER`/`PAPER_ALT`/
`PAPER_RAISED` roles** to absorb the parchment/paper colors currently
duplicated as separate literals in `TileCell.tsx` and `TileModal.tsx` (see
below). Turn the module into a `getColors(scheme: "light" | "dark")`
function (or a `LIGHT`/`DARK` object pair) rather than flat exported
constants, since every consumer now needs to pick a set at render time via
`useResolvedColorScheme()`:

```ts
// light (current values, unchanged) vs. dark (new)
INK: "#000000"        → "#e9d5ff"   // pale lavender ink instead of black
INK_BODY: "#1c1917"   → "#f5f0ff"
INK_SUBTLE: "#78716c" → "#8b7aa8"
GREEN: "#0e9f4f"       (unchanged both — still reads fine on purple)
BLUE: "#1d4ed8"        (unchanged both)
BLUE_TINT: "#bfdbfe"  → "#3a2760"   // needs to stay a *tint behind BLUE text*, not literal light blue, in dark
ORANGE: "#c2410c"      (unchanged both)
ORANGE_LINE: "#f97316" (unchanged both)
RED: "#b91c1c"          (unchanged both)
RULE: "rgba(0,0,0,0.25)" → "rgba(255,255,255,0.25)"
PAPER: "#f2ead4"       → "#2e1d4f"   // the book-page / cover-color-fallback / speech-bubble parchment tone
PAPER_ALT: "#e6d9b8"   → "#251a3f"   // second stop for TileCell's two-tone gradient
PAPER_RAISED: "#ffffff" → "#3a2760"  // was flat white (close button, speech-bubble fill) — a raised, lighter parchment in dark
```
These are a first-pass proposal, same caveat as Phase 3's palette — adjust
after seeing it live. Update the portaled consumers —
`themes/comic/board/TaskPanel.tsx`, `RequirementTree.tsx`,
`SubmissionBubble.tsx`, `TileModal.tsx` — to call `useResolvedColorScheme()`
and pick the matching set.

**`client/src/themes/comic/board/TileModal.tsx`** needs more than a
palette swap — it currently has its **own separate local hardcoding**
that was never routed through `colors.ts` at all: a local
`const PAGE_BG = "#f2ead4"` and `const BORDER_COLOR = "#000000"`, plus raw
Tailwind `bg-white`/`text-black`/`border-black` classes on the close button
(`bg-white text-black`, `borderColor: BORDER_COLOR`) and the two
submission-bubble elements (`bg-white`, `borderColor: BORDER_COLOR`). Delete
the two local constants; import `PAPER`/`PAPER_RAISED`/`INK` from
`colors.ts` instead (`PAGE_BG` → `PAPER`, `BORDER_COLOR` → `INK`, the raw
`bg-white`/`text-black` close-button and speech-bubble classes → inline
`style` using `PAPER_RAISED`/`INK` the same way the rest of the file already
sets `style={{ borderColor: ... }}`). Confirmed with the user: in
comic-dark this should read as dark parchment, not stay literal white paper.

**`client/src/themes/comic/board/TileCell.tsx`** — `coverColor`'s fallback
(currently a separate literal `"#ffead4"`) and the two parchment-gradient
`backgroundColor` values (currently separate literals `"#e6d9b8"`/`"#f2ead4"`)
should import and reuse `colors.ts`'s new `PAPER`/`PAPER_ALT` (same values,
just deduplicated into the shared file instead of three near-identical
literals maintained separately) via `useResolvedColorScheme()`. Also fix
the freeze-badge label's raw `text-black` (line ~180) to use `colors.ts`'s
`INK` the same way. The freeze badge's own background (`#d2412d`) and its
`color: "#fff"` are a separate, solid badge fill — use your judgment on
whether that one stays fixed (similar reasoning to Discord's fixed brand
button — a solid badge color that doesn't need to track scheme) or also
gets a light/dark pair; no strong reason to require either answer.

**Verification**: open a tile modal on a comic-themed bingo in both Light
and Dark — confirm the task panel / requirement tree / submission bubbles /
modal chrome (close button, book-page background, speech-bubble background)
all switch palette together, instead of some pieces staying frozen on the
light/cream/white look while others follow. Confirm the halftone dot grid
is visible (not washed-out/invisible) against the dark purple background.
Confirm `Dialog.tsx`'s and `TileModal.tsx`'s modal backdrops (`bg-scrim/70`)
look the same as they always have, in both schemes. Console-error check;
`npx tsc --noEmit`.

**Commit this phase.**

---

## Final verification (after all four phases)

```
cd client
npx tsc --noEmit
grep -rn "text-fg\b\|border-fg\b\|bg-fg\b\|text-fg-muted\|text-fg-subtle\|text-accent-fg\|border-line\b\|border-line-strong\b\|bg-bg\b\|--color-bg\b\|--color-fg\b\|--color-line\b" src   # expect 0 real hits anywhere (known exclusions from Phase 1/Must-not-change aside)
grep -rn "bg-black/70\|bg-white\b\|text-black\b\|border-black\b" src/core/ui/Dialog.tsx src/themes/comic/board/TileModal.tsx   # expect 0 hits — both should be fully token/colors.ts-backed now
```
Live browser pass, both themes × all three color-scheme choices, across:
BingoList, ModPage (submissions + audit log), SiteAdminPage, board page,
Draft page, Stats page, a submission modal, an open tile modal (task panel,
requirement tree, submission bubbles), the signup form. No console errors
anywhere. No `server/` diff. Re-read the Acceptance bar at the top of this
doc and confirm every line item holds.

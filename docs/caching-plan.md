# Caching for the board and images (issue #63) — implementation plan

**Status:** approved plan, not yet implemented. Written 2026-09-18 against
`main` at `8db94a0` (PR #64, image variants, merged).
**Scope:** https://github.com/cosmic-abyssless/tectonic-bingo/issues/63 —
aggressively cache tile images, wiki images, and the board structure.
**No schema or migration changes anywhere in this plan.** No service worker.

## What was measured (so you don't re-derive it)

- **Uploads today** (`/uploads/...`, originals and `-thumb.webp`/`-full.webp`
  variants): `Cache-Control: public, max-age=0` + weak ETag. The browser
  revalidates every image on every page view — a board view makes 25 requests
  that all return `304`. That round trip per image is the cost to remove.
- **Uploaded filenames are unique and never rewritten**
  (`server/src/middleware/upload.ts`: `${Date.now()}-${random}${ext}`; replacing
  a tile image uploads a NEW file and writes a new `imageUrl`,
  `server/src/routes/admin.ts` ~line 214). Variants are derived by suffix,
  written once, atomically, and never regenerated
  (`server/src/middleware/imageVariants.ts`). So a `/uploads/...` URL's bytes
  never change → safe to mark `immutable`.
- **Wiki icons** load only in the admin editor (`client/src/core/ui/ItemSearchInput.tsx`
  `iconUrlFor()` ~line 13 and the dropdown's server-provided `iconUrl`;
  `client/src/core/admin/RequirementTreeEditor.tsx` ~line 40). The wiki CDN
  sends `max-age=300, s-maxage=86400, stale-while-revalidate=300` — 5 minutes
  of browser cache. 248 distinct items, icons are a few hundred bytes each.
  **Decision: not proxying them in this plan** (see "Out of scope").
- **Board API**: `GET /api/bingos/:slug/board` is **175,747 B raw / 17,747 B
  gzipped** (25 tiles, 532 nodes), served **uncompressed** with no
  `Cache-Control`; Express's weak ETag already gives `304`s. It renders as an
  empty grid until it lands (`BingoPageProvider.tsx` ~line 52-54: the board query
  isn't awaited).
- **Board structure is frozen from the `live` stage onward** — every tile /
  task / line / category / tile-image mutation goes through
  `assertBoardEditable` (`server/src/routes/admin.ts`); before that, admin
  mutations broadcast a `bingo_changed` WebSocket event
  (`server/src/routes/admin.ts` ~line 29-36) and the client invalidates
  `["board"]` (`client/src/context/WebSocketContext.tsx` ~lines 18-30).
- **The board is NOT identical for every viewer**: `bingoService.canViewTiles`
  (`server/src/services/bingoService.ts` ~line 88) returns an empty board to
  non-mods before the `reveal` stage and the full board to mods. So HTTP
  caching must be `private`, and any persisted copy must be keyed per user.
- **Data layer**: TanStack Query with plain `fetch` (`client/src/api/client.ts`,
  `client/src/api/queries.ts`, `QueryClient` in `client/src/main.tsx` with
  `staleTime: 10_000`, no persistence). The board query key is
  `queryKeys.board(slug)` = `["board", slug]`.
- **Known gap**: after a WebSocket reconnect (`WebSocketContext.tsx` `ws.onclose`
  retries every 3 s) nothing refetches, so events missed while offline are lost.

## For the implementer

- Work on a branch off `main` (suggested: `caching`). Commit at the end of
  **every phase**; the app must build and behave after each. Do not reorder,
  do not squash.
- Verification after every phase: `npm run build` (root: server `tsc` + client
  `tsc && vite build`) and `npm test` (server vitest — currently 33 files / 417
  tests, all must still pass). E2E (`e2e/*.spec.ts`) is **deferred** per repo
  policy — do not run or fix it.
- Line numbers above and below are approximate — **search for the quoted code,
  not the number.**
- Server tests go in `server/src/**/*.test.ts` using an in-process Express app +
  `fetch` (copy the shape of `server/src/middleware/imageVariants.test.ts`).
  The client has no test setup today; Phase 3 adds a minimal one for pure
  helpers only.
- Do **not** run anything that writes to the live dev DB or `server/uploads/`
  beyond what the app does on its own. To check headers use `curl -sI` against
  `http://localhost:5173/...` (the Vite dev proxy passes headers through).

## Phase 1 — HTTP caching for uploads and built assets (server only)

### 1a. Uploads: one year, immutable (`server/src/index.ts`, the `/uploads` mount)

Today: `app.use("/uploads", serveImageVariants(UPLOADS_DIR), express.static(UPLOADS_DIR));`

Change the static options to
`{ maxAge: "365d", immutable: true, etag: false, lastModified: false }`
(unique filenames make validators pointless). This covers originals, existing
variants and freshly generated variants — `serveImageVariants` calls `next()`
once the file exists, so the same static handler serves them.

**The redirect fallback must not be cached.** In
`server/src/middleware/imageVariants.ts` the final
`res.redirect(...)` (variant couldn't be generated → send the original) must
first set `res.set("Cache-Control", "no-store")`. Otherwise a variant URL that
failed once is pinned to the original for a year even after it becomes
generable. 404s get no caching headers from Express — leave them.

### 1b. Built client assets (`server/src/index.ts`, `express.static(CLIENT_DIST)`)

Vite emits content-hashed files under `/assets/`. Serve those `immutable` for a
year and keep `index.html` revalidating: use `setHeaders` on the
`CLIENT_DIST` static mount — if `res`'s path starts with `<CLIENT_DIST>/assets/`
→ `Cache-Control: public, max-age=31536000, immutable`; for `index.html` →
`Cache-Control: no-cache`. Everything else (favicon etc.) keeps the default.

### 1c. Tests (`server/src/middleware/imageVariants.test.ts` or a new
`server/src/uploadsCaching.test.ts`)

Mount the same middleware + static options in a temp-dir Express app and assert:
an original and a variant return `cache-control` containing `max-age=31536000`
and `immutable`; the generated-on-demand variant does too; the
broken-original redirect (`302`) has `no-store`; a 404 has no `immutable`.
To avoid duplicating the option object, export it from a tiny module (e.g.
`server/src/middleware/uploadsStatic.ts` exporting `uploadsStaticOptions`) and
import it in both `index.ts` and the test.

**Manual check:** `curl -sI http://localhost:5173/uploads/tiles/<a real tile file>`
→ `Cache-Control: public, max-age=31536000, immutable`, no `ETag`. Reload the
board with DevTools → Network open: the 25 tile images should now show
"(memory cache)"/"(disk cache)" with no request at all on the second load.

## Phase 2 — Compression + validators on the API (server only)

### 2a. Compression (`server/src/index.ts`)

`npm install compression -w server` and `npm install -D @types/compression -w server`.
Add `app.use(compression())` right after `app.use(express.json(...))`. The
default filter skips already-compressed image types, so uploads are unaffected.
Expected: `/board` 176 KB → ~18 KB.

### 2b. `Cache-Control: private, no-cache` on the two page-load endpoints
(`server/src/routes/bingos.ts`: `router.get("/:slug", ...)` (the shell) and
`router.get("/:slug/board", ...)`)

Set `res.set("Cache-Control", "private, no-cache")` at the top of both
handlers. `no-cache` = "always revalidate", which the existing weak ETag turns
into a cheap `304`. **Do NOT use `max-age`**: React Query refetches after a
`bingo_changed` WebSocket event go through the browser HTTP cache and would be
served stale. **Do NOT use `public`**: the board depends on the viewer
(`canViewTiles`) and both endpoints are per-user.

### 2c. Tests (`server/src/routes/bingos.test.ts` if one exists, else a new file)

If the routes can't be mounted in isolation without auth/DB scaffolding, test
what is testable: a small helper test asserting compression is applied to a
large JSON response (send `Accept-Encoding: gzip`, expect `content-encoding:
gzip`) and skipped for `image/webp`. Do not build heavy auth scaffolding for
this — verify the two `Cache-Control` values manually (below).

**Manual check** (dev-login is a READ here — do not submit/approve/upload
anything): `curl -sI -H "Accept-Encoding: gzip" --cookie <session> .../api/bingos/<slug>/board`
→ `content-encoding: gzip`, `cache-control: private, no-cache`, an `etag`; a
repeat with `If-None-Match: <etag>` → `304`.

## Phase 3 — Persist the board structure on the client (stale-while-revalidate)

Only `["board", slug]` is persisted. Do **not** persist the bingo shell
(user-specific: `isMod`, `myTeam`, rosters), team progress, submissions, or
anything else — they change constantly and are cheap.

### 3a. A tiny pure module: `client/src/api/boardCache.ts`

No new dependency (do not add `@tanstack/react-query-persist-client` — one
query doesn't justify it, and plain helpers are trivially testable).

```ts
export const BOARD_CACHE_SCHEMA = 1;                 // bump when the board response shape changes
export const BOARD_CACHE_MAX_AGE_MS = 7 * 24 * 3600_000;
export const BOARD_CACHE_MAX_ENTRIES = 3;            // per browser, newest first
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function boardCacheKey(userId: string, slug: string): string; // `board:v${SCHEMA}:${userId}:${slug}`
export function readBoardCache<T>(userId: string, slug: string, build: string, now?: number, storage?: StorageLike): T | undefined;
export function writeBoardCache<T>(userId: string, slug: string, build: string, data: T, now?: number, storage?: StorageLike): void;
export function clearBoardCache(storage?: StorageLike): void;        // removes every key starting `board:v`
```

Stored value: `{ savedAt, build, data }`. `readBoardCache` returns `undefined`
(and removes the entry) when: missing, unparsable JSON, `build` differs from
the current build id, or older than `BOARD_CACHE_MAX_AGE_MS`. All storage calls
in try/catch (private-mode / quota errors must never break the page).
`writeBoardCache` evicts the oldest `board:v*` entries beyond
`BOARD_CACHE_MAX_ENTRIES` (order by `savedAt`) and swallows quota errors.

**Build id**: add to `client/vite.config.ts`
`define: { __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA ?? String(Date.now())) }`
and declare `declare const __BUILD_ID__: string;` in `client/src/vite-env.d.ts`.
A new deploy therefore discards every persisted board, so a changed response
shape can never be hydrated into new code.

### 3b. Wire it into `useBoard` (`client/src/api/queries.ts`)

`useBoard(slug)` gets the current user id from `useAuth()`
(`client/src/context/AuthContext.tsx`; `ProtectedRoute` guarantees a user before
board pages render) and:

- `initialData`: `readBoardCache(userId, slug, __BUILD_ID__)`;
- `initialDataUpdatedAt: 0` — the hydrated copy counts as **stale**, so the query
  revalidates immediately on mount (a cheap `304`) and the grid paints
  instantly from the cache in the meantime;
- persist on every success: wrap the existing `queryFn` (or use the query
  cache subscription) to call `writeBoardCache(userId, slug, __BUILD_ID__, data)`.

Keep `staleTime: 10_000` (global default) unchanged. Keep `queryKeys.board`
unchanged.

### 3c. Clear on logout (`client/src/context/AuthContext.tsx`, `logout`)

Call `clearBoardCache()` before `setUser(null)`. (Keys already include the user
id, so a different user on the same browser never reads someone else's copy;
this also drops the data for the logging-out user.)

### 3d. Tests

Add to `client/package.json` `"test": "vitest run"`. Create
`client/src/api/boardCache.test.ts` with `// @vitest-environment node` and an
in-memory `StorageLike` stub. Cover: round-trip; key includes user id and slug
(user A never reads user B's entry); build mismatch → `undefined` and entry
removed; expiry; corrupt JSON → `undefined`; eviction keeps the newest 3;
`clearBoardCache` removes only `board:v*` keys; storage that throws on
`setItem`/`getItem` doesn't throw. Do not add jsdom or Testing Library.

**Manual check:** load a board page, confirm `localStorage` has a
`board:v1:<userId>:<slug>` key (~350 KB). Reload: the grid appears before the
`/board` response returns (in DevTools → Network, right-click the `/board`
request → "Block request URL", reload → tiles still render from cache; then
unblock). Log out → the key is gone. Switch to a second dev user (if
available) → their board is fetched, not the first user's.

## Phase 4 — Refetch after a WebSocket reconnect

In `client/src/context/WebSocketContext.tsx`, track whether the socket has
connected before (a `useRef<boolean>`). In `ws.onopen`, if it is a
**re**connect (a previous open occurred), call
`queryClient.invalidateQueries()` once to refetch everything active — events
missed while offline were lost. Do not do this on the first connect (the page's
own queries are already loading). Manual check: with a board open, stop and
restart the server (`server` dev process); when the socket reconnects the page
refetches without a manual reload.

## Phase 5 — Persist the comic cover's dominant colour (small polish)

`client/src/themes/comic/useDominantColor.ts` keeps its per-URL result in an
in-memory `Map` only, so every reload re-decodes each cover image on a canvas
and the cover colour flashes in. Back the `Map` with `localStorage`
(`dominant:v1` → `{ [url]: "rgb(r, g, b)" | null }`, capped at ~300 entries,
oldest dropped first, all access in try/catch). Read once at module load to
seed the map; write (debounced or on idle) when a new result is cached. Image
URLs are immutable per tile image (see Phase 1), so an entry never goes stale.
Do not change the extraction algorithm or the hook's signature. Manual check:
reload the board — the covers should paint in their final colour on first
frame with no colour flash.

## Acceptance bar

- `npm run build` and `npm test` pass; client `npm test` passes.
- Second load of the board: tile images make **no network request** (cache
  hits), `/board` transfers ~18 KB gzipped (or a `304`), and the grid renders
  before the `/board` response arrives.
- `curl -sI` shows the header values in Phases 1–2 exactly.
- Admin edits during `planning` still show up live (the `bingo_changed` →
  `["board"]` invalidation is untouched and still refetches).
- Logging out clears the persisted board; switching users never shows the
  previous user's copy.

## Must not change

- The `serveImageVariants` behaviour (generate-on-demand, redirect fallback,
  path-traversal guard) — only the header on the redirect branch is added.
- No `Cache-Control: public` or `max-age` on `/api/*` responses; no caching of
  the shell, progress, submissions, or any per-user/stateful endpoint.
- No service worker / PWA plugin. (An SPA with live WebSocket state behind
  Discord auth risks serving stale board state; long-lived headers on hashed and
  immutable assets get almost all of the benefit with no invalidation risk.)
- `queryKeys`, the global `staleTime`, and the WebSocket event → invalidation
  mapping.
- The board response shape and `canViewTiles` semantics.

## Out of scope (deliberately deferred)

- **Wiki icon caching proxy** (`/api/osrs-items/icon/:name` → disk cache with
  long headers). Icons appear only in the admin editor, so the benefit is small
  (wiki icons already cache for 5 minutes; ~248 icons, well under 1 MB). If
  they ever appear in player views, build it then: descriptive User-Agent
  (`config.ts` `USER_AGENT`), strict name validation so it can't be an open
  proxy, rate limiting, and a cold-cache miss path.
- Persisting the bingo shell / team progress (user-specific and cheap).
- IndexedDB (localStorage's ~5M-character quota comfortably fits ~350 KB × 3).
- Server-side board memoisation or an explicit version/`updatedAt` column —
  the ETag already makes revalidation cheap, and the structure is frozen from
  `live` anyway.

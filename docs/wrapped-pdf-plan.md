# Wrapped: download as a PDF

A viewer can download their whole Wrapped as a PDF. Each page of the Wrapped (a Scene, `core/wrapped/Scene.tsx`) is a
page of the PDF, in order, drawn as it looks fully read: every Reveal shown. It works the same in both themes.

## Decisions

| Question | Decision |
| --- | --- |
| What a page is | A `WrappedScene`: a comic page in the comic theme (including the front cover and the contents page the book adds), one screen of the story in the default theme. One Scene, one PDF page, in document order. A Scene that's only a way on from the Wrapped is left out (`<WrappedScene pdf={false}>`): the comic's back cover, whose Rewind, Board and Feedback teasers mean nothing in a PDF. |
| Contents | The comic's contents page is clickable in the PDF: each story (`data-pdf-link-section`) links to the first PDF page of its section (the theme's `data-wrapped-section` round its Scenes). Its last entry says "Share cards" or "Credits" without "& back cover". |
| How it's drawn | In the browser. Each Scene is drawn to an image with `html-to-image` (as the share cards are, `core/wrapped/shareCardImage.ts`) and placed on its own PDF page with **jsPDF** (`jspdf@4.2.1`, loaded with a dynamic `import()` only when the button is pressed, so it never weighs on the page). The text in the PDF is part of the picture, so it can't be selected. That's accepted, because it keeps the comic's look exactly. No server work. |
| Which DOM | **The live page's own Scenes**, not a second copy. The comic book's pages are laid out, framed (the slanted panel quads, `frames.ts`) and numbered (the footers portaled into each Scene) by `BookController` and `WrappedPage`, and a copy would lose all that. Each Scene element is captured on its own. html-to-image clones the node without its ancestors, so the camera's transforms on the world don't apply. Reset the Scene's own positioning on the clone (html-to-image's `style` option: `transform: none`, `left/top: 0`, `margin: 0`, no outer `box-shadow`). |
| Fully read | While it draws, every Reveal shows as reached, without animating. Add a "show everything" override in `core/wrapped/sceneProgress.tsx` that both kinds of Scene honour. A page-driven Scene (the comic) reports `reached = steps` and the theme's `reveal` component (`ComicReveal`) is told it's reached. A scroll Scene's `Reveal` (default theme) shows at full opacity, not following the scroll. When the PDF is done (or fails), everything goes back to how the reader left it, and the comic's camera stays where it was. |
| Page size | Each PDF page is the size of its Scene (CSS px × 0.75 = pt), so pages can differ (the default theme's screens). Draw at `pixelRatio` 3 for the comic's 420 px pages and 2 for the default theme, as JPEG at quality 0.9, to keep a 40-page PDF to around 10 MB. Set `backgroundColor` to the Scene's own computed background, so no page comes out transparent or black. |
| Speed and memory | Pages are drawn one at a time, each canvas added to the PDF and dropped before the next. Fonts are embedded once (`getFontEmbedCSS` on the first Scene, passed as `fontEmbedCSS` to every page), not refetched per page. |
| iPhone / WebKit | Draw each page twice and keep the second, as `renderShareCard` does: WebKit's first draw lacks the images inside the SVG (#562). Factor the shared bit out of `shareCardImage.ts` rather than copying it. |
| Images | Avatars (Discord's CDN, with CORS), item icons, and Wrapped art (uploads) are fetched by html-to-image. One that can't be read draws as `imagePlaceholder` (blank), never failing the whole PDF. Lazy images (`loading="lazy"`) off screen may not have loaded yet, so before drawing a page, wait for its `<img>`s to finish (`img.decode()`, ignoring failures). |
| Left out of the pages | Buttons and other controls inside the Scenes (the share cards' Copy, Download and Share buttons, the Outro's Rewind, Board and Feedback buttons, "Skip to the end") are left out with html-to-image's `filter`. Mark them `data-pdf-skip` where they're drawn, and leave out `button`, `a[role=button]` and `[data-pdf-skip]`. The comic's HUD, desk and side stickers aren't inside any Scene, so they're not in it anyway. |
| Preview | A Moderator's preview Wrapped prints "Preview" across every PDF page, like its share cards do (`PreviewWatermark` in `ShareCards.tsx`). Draw it with jsPDF over each image, or wrap the capture: whichever is simpler. |
| Where the button is | **Both** places: (1) the Wrapped header's `controls` in both themes (`WrappedPage.tsx` and `WrappedPageLayout.tsx`, beside the Preview badge), and (2) at the end, beside the share cards (the comic `WrappedOutro.tsx`, the default `WrappedOutro.tsx` / `WrappedShareCards`). Both start the same export. |
| Label and progress | The button says **Download PDF**. While it works it says "Making PDF… 12 of 38" and is disabled. In the comic, a quiet overlay over the stage stops the reader turning pages meanwhile. Once done: a toast "Saved". If it fails: "Couldn't make the PDF" (the share cards' toasts, `run` in `ShareCards.tsx`), and the error goes to Sentry via the client's usual logging. |
| Saving | Where the browser can share files (`navigator.canShare({ files })`, phones), offer the share sheet, as `shareImage` does. Otherwise download it (`downloadImage`, generalized to any blob). File name: `<bingo slug>-wrapped.pdf`, or with the Player's name when the share cards' `fileName` has it. Follow how the share card file names are built. |
| Theme split | The export logic lives in core (`core/wrapped/wrappedPdf.ts`: find the Scenes, draw them, build the PDF; plus a `useWrappedPdf()` hook with `{ start, progress, busy }`). Each theme only places a button (its own look: `ComicButton` / `Button`) and, for the comic, the overlay. Colours from tokens / the comic palette only. |
| Who can | Anyone who can see the Wrapped, on their own Wrapped. Nothing is stored or sent to the server. |
| Generator | Nothing to add: it's a read-only, client-only action, with nothing a generated Bingo needs to have done. |

## Tests

- `wrappedPdf`: given Scene elements, it draws them in document order, makes one page each at the Scene's size, leaves
  out `[data-pdf-skip]` and buttons, keeps going past an image that fails, and restores the "show everything" override
  afterwards, including when it throws. Mock `html-to-image` and `jspdf`.
- `sceneProgress` / `Scene`: with "show everything" on, a page-driven Scene reports every step reached and a scroll
  Scene's Reveal is fully shown. With it off, both behave as before.
- Both themes: the header and the Outro show **Download PDF**, and pressing either starts the export.

## Verifying (Playwright, headless)

On a generated Finished Bingo with Wrapped published (write only to generated Bingos; `testdata-20261016-0039` is
there), logged in as a Player on it with `POST /auth/dev-login`:

- comic and default, at desktop and phone width (390×844), and WebKit with the iPhone profile: press Download PDF from
  the header and from the Outro, save the file, and check:
  - the page count equals the number of Scenes;
  - every page is fully read: no pencil-only comic panels, no faded default lines;
  - avatars, item icons and art are drawn;
  - no buttons are on the pages;
  - it has the page numbers.
  Render a few pages of the PDF to PNG (e.g. with `pdfjs-dist` in Node) and look at them.
- After the export, the comic book is where the reader left it, with the same panels inked as before.
- A Moderator's preview PDF has "Preview" on every page.
- Report the file size and how long a full export takes.

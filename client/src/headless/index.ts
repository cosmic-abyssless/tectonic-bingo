// The only thing a theme (client/src/themes/**) may import from the
// headless layer. Deliberately does NOT re-export useBingoPageRaw — that's
// an internal escape hatch used only within headless/ itself
// (useSubmissionFlow.ts), never by themed code.
export { BingoPageProvider } from "./BingoPageProvider";
export { useBingoPage, useBoardModel, useTileModel, usePageEvent } from "./useBingoPage";
export type * from "./types";

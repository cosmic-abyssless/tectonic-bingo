// The only thing a theme (client/src/themes/**) may import from the
// headless layer. Deliberately does NOT re-export useBingoPageRaw — that's
// a transitional escape hatch for not-yet-decomposed components
// (core/submissions/SubmissionModal.tsx, until Phase 4) and pages/BingoPage.tsx
// itself, never for themed code.
export { BingoPageProvider } from "./BingoPageProvider";
export { useBingoPage, useBoardModel, useTileModel, usePageEvent } from "./useBingoPage";
export type * from "./types";

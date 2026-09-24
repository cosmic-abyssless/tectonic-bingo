// The only thing a theme (client/src/themes/**) may import from the
// headless layer. Deliberately does NOT re-export useBingoPageRaw — that's
// an internal escape hatch used only within headless/ itself
// (useSubmissionFlow.ts), never by themed code.
export { BingoPageProvider } from "./BingoPageProvider";
export { useBingoPage, useBoardModel, useTileModel, usePageEvent } from "./useBingoPage";
export { useSignupForm } from "./useSignupForm";
export type { SignupFormModel, SignupQuestionModel, SignupChoiceModel, SignupCaModel, SignupBlock } from "./useSignupForm";
export { usePartnerPanel } from "./usePartnerPanel";
export type { PartnerPanelModel } from "./usePartnerPanel";
export { useBingoHeader } from "./useBingoHeader";
export type { BingoHeaderModel } from "./useBingoHeader";
export type * from "./types";

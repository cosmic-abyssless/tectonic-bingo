import { SUBMISSION_REACTION_NAMES, type SubmissionReaction } from "@bingo/shared";
import fire from "../../assets/reactions/fire.svg";
import tada from "../../assets/reactions/tada.svg";
import joy from "../../assets/reactions/joy.svg";
import skull from "../../assets/reactions/skull.svg";
import eyes from "../../assets/reactions/eyes.svg";

// Each reaction drawn from Twemoji (assets/reactions/README.md), so it looks the same everywhere instead of in whatever
// emoji font the device has. `name`: what it's called in labels (SUBMISSION_REACTION_NAMES, as the audit log says it).
const SRC: Record<SubmissionReaction, string> = { "🔥": fire, "🎉": tada, "😂": joy, "💀": skull, "👀": eyes };
export const REACTION_ART = Object.fromEntries(
  Object.entries(SRC).map(([emoji, src]) => [emoji, { src, name: SUBMISSION_REACTION_NAMES[emoji as SubmissionReaction] }]),
) as Record<SubmissionReaction, { src: string; name: string }>;

import type { RewindStandoutModel } from "../../../headless/types";

// The SFX bubble's words, by what made the Submission stand out (#225). Where there's more than one, the Submission
// picks one by its id, so the same Submission always says the same thing.
const WORDS: Record<RewindStandoutModel["kind"], readonly string[]> = {
  gp: ["KA-CHING!", "CHA-CHING!"],
  luck: ["JACKPOT!", "NO WAY!"],
  reactions: ["HYPE!", "POG!"],
  tile: ["BOOM!", "DING!"],
  line: ["BINGO!"],
  first: ["FIRST!"],
};

export function sfxWord(kind: RewindStandoutModel["kind"], submissionId: string): string {
  const words = WORDS[kind];
  let hash = 0;
  for (let i = 0; i < submissionId.length; i++) hash = (hash * 31 + submissionId.charCodeAt(i)) | 0;
  return words[Math.abs(hash) % words.length]!;
}

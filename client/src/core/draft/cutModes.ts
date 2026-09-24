import type { CutMode, DraftShares, SignupMode } from "@bingo/shared";

/**
 * The draft's cut modes (bingos.cutMode), named and explained for mods: the settings picker, the signups table's notice
 * and the confirmation before the draft stage. "Pairs only" is for duo bingos; a solo bingo has only singles, so
 * "even" there just cuts the newest players who don't split evenly.
 */
export function cutModeOptions(signupMode: SignupMode): { value: CutMode; label: string; help: string }[] {
  const none = {
    value: "none" as const,
    label: "No cuts",
    help: "Everyone is drafted and nobody is cut. Captains can pick anyone, in any order, so teams may end up different sizes.",
  };
  if (signupMode === "solo") {
    return [
      {
        value: "even",
        label: "Even teams",
        help: "Every team drafts the same number of players. The newest signups that don't split evenly across the teams are cut. For example, 5 teams and 23 players: each team drafts 4, and the 3 newest signups are cut.",
      },
      none,
    ];
  }
  return [
    {
      value: "even",
      label: "Pairs + singles",
      help: "Every team drafts the same number of pairs and the same number of singles, in any order. Pairs and singles that don't split evenly across the teams are cut, newest signups first. For example, 5 teams, 6 pairs and 7 singles: each team drafts 1 pair and 1 single; the newest pair and the 2 newest singles are cut.",
    },
    {
      value: "pairs_only",
      label: "Pairs only",
      help: "Only pairs are drafted, the same number to every team. Every single is cut, and so are the newest pairs that don't split evenly across the teams. To keep singles in, pair them up on the Signups tab before the draft.",
    },
    none,
  ];
}

export function cutModeLabel(cutMode: CutMode, signupMode: SignupMode): string {
  return cutModeOptions(signupMode).find((o) => o.value === cutMode)?.label ?? cutMode;
}

/** "1 pair and 1 single" / "4 players": what every team drafts. */
export function describeShares(shares: DraftShares, signupMode: SignupMode): string {
  const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
  if (signupMode === "solo") return count(shares.singles, "player");
  if (shares.singles === 0) return count(shares.pairs, "pair");
  return `${count(shares.pairs, "pair")} and ${count(shares.singles, "single")}`;
}

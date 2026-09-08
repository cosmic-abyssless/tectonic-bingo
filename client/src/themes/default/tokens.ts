// Neutral theme — the only theme every bingo can always fall back to. These
// are the board-scoped variables a themed bingo may override; page chrome uses
// the app tokens from index.css and is not themeable.
export const defaultTokens: Record<string, string> = {
  "--tile-bg": "#101012",
  "--tile-border": "#232327",
  "--tile-empty": "#0c0c0e",
  "--tile-accent": "#a1a1aa",
  "--tile-complete": "#4ade80",
  "--tile-frozen": "#60a5fa",
};

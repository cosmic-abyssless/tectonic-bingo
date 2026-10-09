// Pure, DB-free text matching for OCR output. OSRS's bitmap font reliably
// confuses PaddleOCR on a handful of glyphs (w<->v, O<->0, a<->e) and drops
// spaces around mixed-case boundaries — see docs/ocr-analysis-plan.md's
// benchmark notes. Every observed miss was within 1-2 edits once normalized,
// so this absorbs that class of error without needing a bigger, slower model.

/** Lowercase, then strip everything but [a-z0-9] — spaces, punctuation, apostrophes all go. */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface FuzzyIncludesOptions {
  /**
   * Override the length-based default (needle length >= 12 ? 2 : 1). Used
   * for codewords: a false-positive there wrongly suppresses the "codeword
   * not found" warning mods rely on, so callers pin it to 1 regardless of
   * the codeword's length instead of letting a long one earn 2.
   */
  maxEdits?: number;
}

/** How many edits a normalized needle of this length may be off by and still count as nearly there. */
function defaultMaxEdits(normNeedle: string): number {
  return normNeedle.length >= 12 ? 2 : 1;
}

/**
 * Whether `pattern` occurs anywhere in `text` within `maxEdits` edits: Sellers' approximate substring search, the
 * Levenshtein table with a free start (a match may begin at any character of `text`), one O(|pattern| × |text|) pass.
 * Replaces a separate bounded Levenshtein per sliding window and width, which cost about 14 times as much.
 */
export function approxIncludes(text: string, pattern: string, maxEdits: number): boolean {
  const m = pattern.length;
  if (m <= maxEdits) return true;
  if (text.length < m - maxEdits) return false;
  // col[i]: the fewest edits turning pattern[0..i) into some text ending at the current character.
  const col = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) col[i] = i;
  for (let t = 0; t < text.length; t++) {
    const c = text.charCodeAt(t);
    let diagonal = col[0]!;
    col[0] = 0;
    for (let i = 1; i <= m; i++) {
      const above = col[i]!;
      col[i] = Math.min(above + 1, col[i - 1]! + 1, diagonal + (pattern.charCodeAt(i - 1) === c ? 0 : 1));
      diagonal = above;
    }
    if (col[m]! <= maxEdits) return true;
  }
  return false;
}

// True iff `needle` appears (exactly, after normalizing) or nearly appears (within edit-distance tolerance) in any
// single line of `lines`. Lines are checked individually, never joined — a needle must not straddle two unrelated lines
// just because they happen to be adjacent in the screenshot. (findBestMatch also joins a line with its wrapped
// continuation, see wrappedLines.)
export function fuzzyIncludes(lines: string[], needle: string, opts: FuzzyIncludesOptions = {}): boolean {
  const normNeedle = normalizeForMatch(needle);
  if (!normNeedle) return false;
  const normLines = lines.map(normalizeForMatch);
  if (normLines.some((line) => line.includes(normNeedle))) return true;
  // Short needles (e.g. "Vorki") skip edit tolerance entirely — fuzzing a 5-character string against arbitrary
  // screenshot text produces far too many false positives to be worth it.
  if (normNeedle.length < 6) return false;
  const maxEdits = opts.maxEdits ?? defaultMaxEdits(normNeedle);
  return normLines.some((line) => approxIncludes(line, normNeedle, maxEdits));
}

/** Lowercased words, separated by single spaces: punctuation and apostrophes split words like spaces do. */
function wordsOf(s: string): string {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(" ");
}

/** One ITEM leaf's single accepted name. */
export interface MatchableItem {
  nodeId: string;
  itemName: string;
  tileId: string;
  tileName: string;
}

export interface DetectedItemMatch {
  tileId: string;
  tileName: string;
  nodeId: string;
  itemName: string;
}

/**
 * Each wrapped continuation joined onto the line it continues. A continuation starts with a lowercase letter, as a chat
 * message wrapped onto a second line does ("…received a new collection log item: Eclipse moon" / "helm (738/1698)"); a
 * line starting otherwise (a capital, a bracket, a timestamp) begins something of its own. The line it continues is
 * its neighbour on either side: the local engine reads the two halves in order, but Cloud Vision can return the
 * continuation first. Not covered: a name wrapped over three lines, and a continuation OCR starts with a stray
 * character (an apostrophe, a digit).
 */
export function wrappedLines(lines: string[]): string[] {
  const joined: string[] = [];
  lines.forEach((line, i) => {
    if (!/^[a-z]/.test(line.trimStart())) return;
    if (i > 0) joined.push(`${lines[i - 1]} ${line}`);
    if (i + 1 < lines.length) joined.push(`${lines[i + 1]} ${line}`);
  });
  return joined;
}

// The item the screenshot shows, when several match. Items are looked for in four ways, best first, and the first way
// that finds any decides:
//   1. a long name read exactly on one line: the screenshot's;
//   2. read exactly across a wrapped line (a join can put two unrelated lines side by side, so it never outranks a
//      whole line, and it takes no edit tolerance: a near match on a join is too weak to stand);
//   3. a long name read nearly on one line: an OCR slip at best;
//   4. a short name (under 6 letters, "Pet", "Vorki") standing as a word: short enough to turn up in anything.
// Among those found the same way, a name that was only ever read inside a longer matched name gives way to it ("Crystal
// weapon seed" inside "Enhanced crystal weapon seed"), and then the first in query order wins. Not the longest name: a
// loot list or bank on screen shows many names, and a long one there isn't the drop. Pure decision logic — no DB or OCR
// involved — so it's testable on its own from plain extracted-text fixtures.
//
// The near-match scan (3) is the only costly part, and it runs only when no item is read exactly anywhere.
export function findBestMatch(extractedText: string[], items: MatchableItem[]): { detectedMatch: DetectedItemMatch | null } {
  const lines = extractedText.map(normalizeForMatch);
  const joined = wrappedLines(extractedText).map(normalizeForMatch);
  const named = items.map((item) => ({ item, name: normalizeForMatch(item.itemName) })).filter((n) => n.name);
  const long = named.filter((n) => n.name.length >= 6);
  const short = named.filter((n) => n.name.length < 6);
  const words = extractedText.map((l) => ` ${wordsOf(l)} `);

  // Each way, as the lines it reads and whether a name is on one of them.
  const ways: { candidates: typeof named; on: string[]; reads: (line: string, n: (typeof named)[number]) => boolean }[] = [
    { candidates: long, on: lines, reads: (line, n) => line.includes(n.name) },
    { candidates: long, on: joined, reads: (line, n) => line.includes(n.name) },
    { candidates: long, on: lines, reads: (line, n) => approxIncludes(line, n.name, defaultMaxEdits(n.name)) },
    { candidates: short, on: words, reads: (line, n) => line.includes(` ${wordsOf(n.item.itemName)} `) },
  ];
  for (const { candidates, on, reads } of ways) {
    const found = candidates.filter((n) => on.some((line) => reads(line, n)));
    if (found.length === 0) continue;
    // Given way only when every line it was read on also holds the longer name: wherever the lines come in the
    // engine's answer, a drop line with just the shorter name keeps it.
    const kept = found.filter((n) => !found.some((other) => other.name !== n.name && other.name.includes(n.name) && on.every((line) => !reads(line, n) || reads(line, other))));
    const { item } = kept[0]!;
    return { detectedMatch: { tileId: item.tileId, tileName: item.tileName, nodeId: item.nodeId, itemName: item.itemName } };
  }
  return { detectedMatch: null };
}

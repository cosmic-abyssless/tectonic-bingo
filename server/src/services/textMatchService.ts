// Pure, DB-free text matching for OCR output. OSRS's bitmap font reliably
// confuses PaddleOCR on a handful of glyphs (w<->v, O<->0, a<->e) and drops
// spaces around mixed-case boundaries — see docs/ocr-analysis-plan.md's
// benchmark notes. Every observed miss was within 1-2 edits once normalized,
// so this absorbs that class of error without needing a bigger, slower model.

/** Lowercase, then strip everything but [a-z0-9] — spaces, punctuation, apostrophes all go. */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Bounded Levenshtein distance: true iff edit distance <= max. Standard DP
// over two rolling rows, with an early exit once a row's minimum already
// exceeds max (no possible cell in a later row can recover from that).
export function levenshteinWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return false;
    [prev, curr] = [curr, prev];
  }
  return prev[n] <= max;
}

export interface FuzzyIncludesOptions {
  /**
   * Override the length-based default (needle length >= 12 ? 2 : 1). Used
   * for codewords: a false-positive there wrongly suppresses the "codeword
   * not found" warning mods rely on, so callers pin it to 1 regardless of
   * the codeword's length instead of letting a long one earn 2.
   */
  maxEdits?: number;
  /**
   * A short needle (under 6 letters) must stand as whole words: for item names, where "Pet" inside "competition" is no
   * pet. Not for the Codeword, which OCR often runs into the date beside it ("Frost05/03/2026").
   */
  shortAsWholeWords?: boolean;
}

// How well `needle` appears in any single line of `lines`: 2 exactly (after normalizing), 1 nearly (within
// edit-distance tolerance), 0 not at all. Lines are checked individually, never joined — a needle must not straddle
// two unrelated lines just because they happen to be adjacent in the screenshot. (findBestMatch's second pass joins a
// line with its wrapped continuation, see wrappedLines.)
export function matchQuality(lines: string[], needle: string, opts: FuzzyIncludesOptions = {}): 0 | 1 | 2 {
  const normNeedle = normalizeForMatch(needle);
  if (!normNeedle) return 0;

  // Short needles (e.g. "Vorki", "Pet") skip edit tolerance entirely — fuzzing a 5-character string against arbitrary
  // screenshot text produces far too many false positives to be worth it.
  if (normNeedle.length < 6) {
    if (!opts.shortAsWholeWords) return lines.some((line) => normalizeForMatch(line).includes(normNeedle)) ? 2 : 0;
    const words = ` ${wordsOf(needle)} `;
    return lines.some((line) => ` ${wordsOf(line)} `.includes(words)) ? 2 : 0;
  }

  const maxEdits = opts.maxEdits ?? (normNeedle.length >= 12 ? 2 : 1);

  const normLines = lines.map(normalizeForMatch);
  if (normLines.some((line) => line.includes(normNeedle))) return 2;
  for (const normLine of normLines) {
    for (let width = normNeedle.length - 1; width <= normNeedle.length + 1; width++) {
      if (width <= 0 || width > normLine.length) continue;
      for (let start = 0; start + width <= normLine.length; start++) {
        if (levenshteinWithin(normLine.slice(start, start + width), normNeedle, maxEdits)) return 1;
      }
    }
  }
  return 0;
}

/** Lowercased words, separated by single spaces: punctuation and apostrophes split words like spaces do. */
function wordsOf(s: string): string {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(" ");
}

// True iff `needle` appears in a line of `lines`, exactly or nearly (matchQuality).
export function fuzzyIncludes(lines: string[], needle: string, opts: FuzzyIncludesOptions = {}): boolean {
  return matchQuality(lines, needle, opts) > 0;
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
 * continuation first.
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

// The item the screenshot shows, when several match: only those read exactly count if any is (a near reading is an OCR
// slip at best), a name inside another matched name gives way to it ("Crystal weapon seed" inside "Enhanced crystal
// weapon seed"), and then the first in query order wins. Not the longest name: a loot list or bank on screen shows many
// names, and a long one there isn't the drop. Pure decision logic — no DB or OCR involved — so it's testable on its own
// from plain extracted-text fixtures.
//
// Two passes: every item on single lines first; only when none matches, every item on a line joined with its wrapped
// continuation (wrappedLines). Long names wrap in chat, but joining can also put two unrelated lines side by side, so
// a join never outranks a name found whole on one line.
export function findBestMatch(extractedText: string[], items: MatchableItem[]): { detectedMatch: DetectedItemMatch | null } {
  for (const lines of [extractedText, wrappedLines(extractedText)]) {
    const matched = items
      .map((item) => ({ item, quality: matchQuality(lines, item.itemName, { shortAsWholeWords: true }), name: normalizeForMatch(item.itemName) }))
      .filter((m) => m.quality > 0);
    if (matched.length === 0) continue;
    const best = Math.max(...matched.map((m) => m.quality));
    const candidates = matched.filter((m) => m.quality === best);
    const { item } = candidates.find((m) => !candidates.some((other) => other.name !== m.name && other.name.includes(m.name))) ?? candidates[0]!;
    return { detectedMatch: { tileId: item.tileId, tileName: item.tileName, nodeId: item.nodeId, itemName: item.itemName } };
  }
  return { detectedMatch: null };
}

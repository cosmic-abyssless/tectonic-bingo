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
}

// True iff `needle` appears (exactly, after normalizing) or nearly appears
// (within edit-distance tolerance) in any single line of `lines`. Lines are
// checked individually, never joined — a needle must not straddle two
// unrelated lines just because they happen to be adjacent in the screenshot.
export function fuzzyIncludes(lines: string[], needle: string, opts: FuzzyIncludesOptions = {}): boolean {
  const normNeedle = normalizeForMatch(needle);
  if (!normNeedle) return false;

  // Short needles (e.g. "Vorki") skip edit tolerance entirely — fuzzing a
  // 5-character string against arbitrary screenshot text produces far too
  // many false positives to be worth it.
  if (normNeedle.length < 6) {
    return lines.some((line) => normalizeForMatch(line).includes(normNeedle));
  }

  const maxEdits = opts.maxEdits ?? (normNeedle.length >= 12 ? 2 : 1);

  for (const line of lines) {
    const normLine = normalizeForMatch(line);
    if (normLine.includes(normNeedle)) return true;

    for (let width = normNeedle.length - 1; width <= normNeedle.length + 1; width++) {
      if (width <= 0 || width > normLine.length) continue;
      for (let start = 0; start + width <= normLine.length; start++) {
        if (levenshteinWithin(normLine.slice(start, start + width), normNeedle, maxEdits)) return true;
      }
    }
  }
  return false;
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

// First item in query order wins. Pure decision logic — no DB or OCR
// involved — so it's testable on its own from plain extracted-text fixtures.
export function findBestMatch(extractedText: string[], items: MatchableItem[]): { detectedMatch: DetectedItemMatch | null } {
  for (const item of items) {
    if (fuzzyIncludes(extractedText, item.itemName)) {
      return { detectedMatch: { tileId: item.tileId, tileName: item.tileName, nodeId: item.nodeId, itemName: item.itemName } };
    }
  }
  return { detectedMatch: null };
}

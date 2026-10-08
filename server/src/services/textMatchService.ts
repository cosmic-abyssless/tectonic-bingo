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
// (findBestMatch's second pass joins a line with its wrapped continuation, see
// wrappedLines.)
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

// First item in query order wins. Pure decision logic — no DB or OCR
// involved — so it's testable on its own from plain extracted-text fixtures.
//
// Two passes: every item on single lines first, exactly as before; only when none matches, every item on a line joined
// with its wrapped continuation (wrappedLines). Long names wrap in chat, but joining can also put two unrelated lines
// side by side, so a join never outranks a name found whole on one line.
export function findBestMatch(extractedText: string[], items: MatchableItem[]): { detectedMatch: DetectedItemMatch | null } {
  for (const lines of [extractedText, wrappedLines(extractedText)]) {
    for (const item of items) {
      if (fuzzyIncludes(lines, item.itemName)) {
        return { detectedMatch: { tileId: item.tileId, tileName: item.tileName, nodeId: item.nodeId, itemName: item.itemName } };
      }
    }
  }
  return { detectedMatch: null };
}

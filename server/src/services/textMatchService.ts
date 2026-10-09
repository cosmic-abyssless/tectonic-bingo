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

// How well an item is read, best first. A name read exactly on one line is the screenshot's; one read exactly across
// a wrapped line is next (a join can put two unrelated lines side by side, so it never outranks a whole line, and it
// takes no edit tolerance: a near match on a join is too weak to stand); a long name read nearly on one line is an OCR
// slip at best; and a short name (under 6 letters, "Pet", "Vorki") standing as a word is weakest of all, short enough to
// turn up in anything.
const enum Tier {
  ShortWord = 1,
  NearLine = 2,
  ExactWrapped = 3,
  ExactLine = 4,
}

interface Hit {
  item: MatchableItem;
  tier: Tier;
  /** Which line (of the single lines, or of the joined ones for ExactWrapped) it was read on. */
  line: number;
  name: string;
}

// The item the screenshot shows, when several match: the best tier wins (above); within it, a name inside another
// name matched on the same line gives way to it ("Crystal weapon seed" inside "Enhanced crystal weapon seed"); then the
// first in query order. Not the longest name: a loot list or bank on screen shows many names, and a long one there
// isn't the drop, so the containment rule only applies within one line. Pure decision logic — no DB or OCR involved —
// so it's testable on its own from plain extracted-text fixtures.
//
// The near-match scan is the only costly part, so it runs only when no item is read exactly anywhere.
export function findBestMatch(extractedText: string[], items: MatchableItem[]): { detectedMatch: DetectedItemMatch | null } {
  const lines = extractedText.map(normalizeForMatch);
  const joined = wrappedLines(extractedText).map(normalizeForMatch);
  const named = items.map((item) => ({ item, name: normalizeForMatch(item.itemName) })).filter((n) => n.name);
  const long = named.filter((n) => n.name.length >= 6);

  let hits: Hit[] = [];
  for (const { item, name } of long) {
    const line = lines.findIndex((l) => l.includes(name));
    if (line >= 0) hits.push({ item, tier: Tier.ExactLine, line, name });
  }
  if (hits.length === 0) {
    for (const { item, name } of long) {
      const line = joined.findIndex((l) => l.includes(name));
      if (line >= 0) hits.push({ item, tier: Tier.ExactWrapped, line, name });
    }
  }
  if (hits.length === 0) {
    for (const { item, name } of long) {
      const maxEdits = defaultMaxEdits(name);
      const line = lines.findIndex((l) => approxIncludes(l, name, maxEdits));
      if (line >= 0) hits.push({ item, tier: Tier.NearLine, line, name });
    }
  }
  if (hits.length === 0) {
    const words = extractedText.map((l) => ` ${wordsOf(l)} `);
    for (const { item, name } of named.filter((n) => n.name.length < 6)) {
      const word = ` ${wordsOf(item.itemName)} `;
      const line = words.findIndex((l) => l.includes(word));
      if (line >= 0) hits.push({ item, tier: Tier.ShortWord, line, name });
    }
  }
  if (hits.length === 0) return { detectedMatch: null };

  // Every hit here is in one tier (each step above runs only when the ones before found nothing).
  hits = hits.filter((h) => !hits.some((other) => other.line === h.line && other.name !== h.name && other.name.includes(h.name)));
  const { item } = hits[0]!;
  return { detectedMatch: { tileId: item.tileId, tileName: item.tileName, nodeId: item.nodeId, itemName: item.itemName } };
}

// Guard (#457): colour and range inputs fire React's onChange on every step of a drag, so one that saves from it sends a
// request per step. That took the site down on 2026-10-03 (docs/postmortems/2026-10-03-colour-picker.md). Outside
// core/ui they go through ColorInput and RangeInput, which save once; inside it, none saves from onChange.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const CORE_UI = path.join(SRC, "core", "ui");

const USE_INSTEAD: Record<string, string> = {
  color: "Use core/ui/ColorInput: it saves once, when the picker closes.",
  range: "Use core/ui/RangeInput: its onChange is for what's on screen, and onCommit saves once, when the drag ends.",
};

/** Every `<input ...>` tag in a file, with its line, read up to the `>` that closes it (skipping `>` inside `{...}`). */
function inputTags(source: string): { line: number; tag: string }[] {
  const tags: { line: number; tag: string }[] = [];
  for (const match of source.matchAll(/<input\b/g)) {
    let depth = 0;
    let end = match.index;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push({ line: source.slice(0, match.index).split("\n").length, tag: source.slice(match.index, end + 1) });
  }
  return tags;
}

/** What's wrong with a file's colour and range inputs, one line each. */
function continuousInputProblems(source: string, inCoreUi: boolean): string[] {
  const problems: string[] = [];
  for (const { line, tag } of inputTags(source)) {
    const type = /\btype=(?:"|'|\{\s*["'])(color|range)\b/.exec(tag)?.[1];
    if (!type) continue;
    if (!inCoreUi) problems.push(`line ${line}: a raw <input type="${type}">. ${USE_INSTEAD[type]}`);
    else if (/onChange=\{[^}]*\b\w*(save|update|mutate|api)\w*/i.test(tag)) problems.push(`line ${line}: <input type="${type}"> saves from onChange, on every step of a drag. ${USE_INSTEAD[type]}`);
  }
  return problems;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(file);
    return /\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

describe("continuous inputs (colour, range)", () => {
  it("never save on every change", () => {
    const problems = sourceFiles(SRC).flatMap((file) =>
      continuousInputProblems(fs.readFileSync(file, "utf8"), file.startsWith(CORE_UI + path.sep)).map((problem) => `${path.relative(SRC, file)} ${problem}`),
    );
    expect(problems).toEqual([]);
  });

  it("are found by the check above", () => {
    expect(continuousInputProblems(`<input type="color" value={c} onChange={(e) => setC(e.target.value)} />`, false)).toHaveLength(1);
    expect(continuousInputProblems(`<input\n  type="range"\n  onChange={(e) => seek(Number(e.target.value))}\n/>`, false)).toEqual([expect.stringContaining("line 1")]);
    expect(continuousInputProblems(`<input type="color" onChange={(e) => saveTeam({ color: e.target.value })} />`, true)).toHaveLength(1);
    expect(continuousInputProblems(`<input type="color" onChange={(e) => setDraft(e.target.value)} />`, true)).toEqual([]);
    expect(continuousInputProblems(`<input type="text" onChange={(e) => save(e.target.value)} />`, false)).toEqual([]);
  });
});

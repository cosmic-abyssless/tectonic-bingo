import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isBlankAnswer, parseChoices, type GraphNode, type SignupQuestion, type Tile } from "@bingo/shared";
import { answerQuestions } from "./answers";
import { DIFFICULTY, buildBoard, deadlockedParts, difficultyOf, planSubmissions, type Claim, type PartModel } from "./board";
import { OptionsError, defaultSlug, normalizeOptions } from "./options";
import { chooseMods, makePlayers, pairUp, playingProbability } from "./people";
import { Rng } from "./rng";
import { runInOrder } from "./setup";
import { DAY, HOUR, TARGET_STAGES, buildTimeline, runLimit } from "./timeline";

describe("Rng", () => {
  it("repeats for a seed, and differs between seeds", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 5 }, () => a.float())).toEqual(Array.from({ length: 5 }, () => b.float()));
    expect(new Rng(1).float()).not.toBe(new Rng(2).float());
  });

  it("keeps forks independent of what the parent does afterwards", () => {
    const first = new Rng(7);
    const forkBefore = first.fork("people").float();
    const second = new Rng(7);
    second.float();
    second.float();
    expect(second.fork("people").float()).toBe(forkBefore);
    expect(new Rng(7).fork("a").float()).not.toBe(new Rng(7).fork("b").float());
  });

  it("stays in range, never picks a zero weight, and shuffles without losing anything", () => {
    const rng = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const n = rng.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      expect(rng.weighted([["never", 0], ["always", 1]])).toBe("always");
    }
    expect(rng.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(() => rng.weighted([["x", 0]])).toThrow();
  });
});

describe("buildTimeline", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  const of = (stage: (typeof TARGET_STAGES)[number], progress = 0.5) => buildTimeline(stage, { now, progress, days: 9 });

  it("puts now inside the target stage", () => {
    const t = (stage: (typeof TARGET_STAGES)[number]) => of(stage);
    expect(t("signup").signupOpensAt.getTime()).toBeLessThan(now.getTime());
    expect(t("signup").captainsAt.getTime()).toBeGreaterThan(now.getTime());
    expect(t("captains").captainsAt.getTime()).toBeLessThan(now.getTime());
    expect(t("captains").draftAt.getTime()).toBeGreaterThan(now.getTime());
    expect(t("draft").draftAt.getTime()).toBeLessThan(now.getTime());
    expect(t("draft").revealAt.getTime()).toBeGreaterThan(now.getTime());
    expect(t("reveal").revealAt.getTime()).toBeLessThan(now.getTime());
    expect(t("reveal").startsAt.getTime()).toBeGreaterThan(now.getTime());
    expect(t("live").startsAt.getTime()).toBeLessThan(now.getTime());
    expect(t("live").endsAt.getTime()).toBeGreaterThan(now.getTime());
    expect(t("complete").endsAt.getTime()).toBeLessThan(now.getTime());
    expect(t("complete").completeAt.getTime()).toBeLessThan(now.getTime());
  });

  it("keeps the moments in order for every stage", () => {
    for (const stage of TARGET_STAGES) {
      const tl = of(stage);
      const order = [tl.createdAt, tl.signupOpensAt, tl.captainsAt, tl.draftAt, tl.revealAt, tl.startsAt, tl.endsAt, tl.completeAt].map((d) => d.getTime());
      expect(order, stage).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it("places a live bingo the requested share of the way through", () => {
    for (const progress of [0.1, 0.5, 0.9]) {
      const tl = of("live", progress);
      expect((now.getTime() - tl.startsAt.getTime()) / (tl.endsAt.getTime() - tl.startsAt.getTime())).toBeCloseTo(progress, 6);
    }
    expect(of("live").endsAt.getTime() - of("live").startsAt.getTime()).toBe(9 * DAY);
  });

  it("stops a run at now, except a finished bingo, which runs to when it was completed", () => {
    expect(runLimit(of("live"))).toEqual(now);
    expect(runLimit(of("draft"))).toEqual(now);
    expect(runLimit(of("complete"))).toEqual(of("complete").completeAt);
  });
});

describe("people", () => {
  it("makes the same, distinct people for a seed", () => {
    const a = makePlayers(new Rng(5), 88, "testdata-x");
    const b = makePlayers(new Rng(5), 88, "testdata-x");
    expect(a).toEqual(b);
    expect(new Set(a.map((p) => p.name)).size).toBe(88);
    expect(new Set(a.map((p) => p.discordId)).size).toBe(88);
    expect(a.every((p) => p.discordId.startsWith("testdata-") && p.skill >= 0.1 && p.skill <= 0.95)).toBe(true);
  });

  it("pairs off about the requested share, symmetrically, and picks mods from the unpaired", () => {
    const players = makePlayers(new Rng(9), 88, "testdata-x");
    const pairs = pairUp(players, new Rng(1), 0.6);
    expect(pairs.length).toBe(26);
    for (const [a, b] of pairs) {
      expect(a.partnerIndex).toBe(b.index);
      expect(b.partnerIndex).toBe(a.index);
    }
    const mods = chooseMods(players, new Rng(2), 3);
    expect(mods).toHaveLength(3);
    expect(mods.every((m) => m.isMod && m.partnerIndex === null && m.reviewWindows.length === 3)).toBe(true);
  });

  it("is more active in the evening than overnight, and adds up to their hours a day", () => {
    const [p] = makePlayers(new Rng(1), 1, "testdata-x");
    p!.offset = 0;
    p!.activity = 3;
    const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
    expect(playingProbability(p!, at(20))).toBeGreaterThan(playingProbability(p!, at(11)));
    expect(playingProbability(p!, at(11))).toBeGreaterThan(playingProbability(p!, at(4)));
    const perDay = Array.from({ length: 24 }, (_, h) => playingProbability(p!, at(h))).reduce((a, b) => a + b, 0);
    expect(perDay).toBeCloseTo(3, 5);
  });
});

describe("normalizeOptions", () => {
  const now = new Date("2026-09-19T14:32:00Z");

  it("has the defaults from the plan", () => {
    const o = normalizeOptions({}, now);
    expect(o).toMatchObject({ stage: "live", progress: 0.5, days: 9, teams: 6, teamSize: 14, mods: 3, me: null });
    expect(o.slug).toBe("testdata-20260919-1432");
    expect(defaultSlug(now)).toBe("testdata-20260919-1432");
  });

  it("takes numbers as numbers (a JSON body) or as text (the command line)", () => {
    expect(normalizeOptions({ stage: "draft", seed: 7, me: "123", teams: 4 }, now)).toMatchObject({ stage: "draft", seed: 7, me: "123", teams: 4 });
    expect(normalizeOptions({ seed: "7", teamSize: "10" }, now)).toMatchObject({ seed: 7, teamSize: 10 });
  });

  it("refuses what it can't use, naming the option the way the caller does", () => {
    expect(() => normalizeOptions({ stage: "nope" }, now)).toThrow(OptionsError);
    expect(() => normalizeOptions({ progress: 3 }, now)).toThrow(/from 0.02 to 1/);
    expect(() => normalizeOptions({ teams: 2.5 }, now)).toThrow(/whole number/);
    expect(() => normalizeOptions({ slug: "real-bingo" }, now)).toThrow(/testdata-/);
    expect(() => normalizeOptions({ slug: "testdata-UPPER" }, now)).toThrow(OptionsError);
    expect(() => normalizeOptions({ teamSize: 99 }, now, { teamSize: "--team-size" })).toThrow(/^--team-size must/);
  });
});

describe("runInOrder", () => {
  it("runs by date, keeps the given order for ties, and skips anything after the limit", async () => {
    const ran: string[] = [];
    const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
    const count = await runInOrder(
      [
        { at: at(5), run: async () => void ran.push("five") },
        { at: at(1), run: async () => void ran.push("one-a") },
        { at: at(1), run: async () => void ran.push("one-b") },
        { at: at(9), run: async () => void ran.push("nine") },
      ],
      at(6),
    );
    expect(ran).toEqual(["one-a", "one-b", "five"]);
    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// The board, against the real export
// ---------------------------------------------------------------------------

interface ExportTask {
  localId: number;
  kind: GraphNode["kind"];
  label: string | null;
  points?: number;
  minCount?: number | null;
  quantity?: number | null;
  itemName?: string | null;
  submitGateLocalId?: number | null;
  pointsGateLocalId?: number | null;
  children?: ExportTask[];
}
interface ExportDoc {
  tiles: { name: string; boardRow: number; boardCol: number; hasFreezePeriod: boolean; freezeDurationMinutes: number; bonusPoints: number; tasks: ExportTask[] }[];
}

const EXPORT_PATH = path.resolve(__dirname, "../../../../tectonic-comics-bingo-export.json");

function toNode(t: ExportTask): GraphNode {
  return {
    id: `n${t.localId}`, bingoId: "b", kind: t.kind, label: t.label ?? null, description: null, notes: null, points: t.points ?? 0,
    minCount: t.minCount ?? null, quantity: t.quantity ?? null, itemName: t.itemName ?? null,
    pointsGateNodeId: t.pointsGateLocalId ? `n${t.pointsGateLocalId}` : null,
    submitGateNodeId: t.submitGateLocalId ? `n${t.submitGateLocalId}` : null,
    allowsPreLoad: false, children: (t.children ?? []).map(toNode),
  };
}

function loadRealBoard() {
  const doc = JSON.parse(fs.readFileSync(EXPORT_PATH, "utf-8")) as ExportDoc;
  const tiles = doc.tiles.map((t, i): Tile => ({
    id: `tile-${i}`, name: t.name, boardRow: t.boardRow, boardCol: t.boardCol, hasFreezePeriod: t.hasFreezePeriod, freezeDurationMinutes: t.freezeDurationMinutes,
    node: { ...toNode({ localId: 100000 + i, kind: "ALL", label: null, points: t.bonusPoints, children: t.tasks }) },
  } as unknown as Tile));
  return { doc, board: buildBoard(tiles, []) };
}

describe.skipIf(!fs.existsSync(EXPORT_PATH))("the real board", () => {
  const { doc, board } = loadRealBoard();

  it("knows how hard every tile is (a new or renamed tile needs a row in DIFFICULTY)", () => {
    const unknown = doc.tiles.map((t) => t.name).filter((name) => !(name.toUpperCase() in DIFFICULTY));
    expect(unknown).toEqual([]);
    const unused = Object.keys(DIFFICULTY).filter((name) => !doc.tiles.some((t) => t.name.toUpperCase() === name));
    expect(unused).toEqual([]);
  });

  it("reads 25 tiles of two pages", () => {
    expect(board.tiles).toHaveLength(25);
    expect(board.parts).toHaveLength(50);
    expect(board.tiles.every((t) => t.parts.length === 2 && t.bonus === 20)).toBe(true);
    expect(board.tiles.filter((t) => t.freezeMs > 0)).toHaveLength(8);
  });

  it("finds no part that can never be finished, including PETS and SLAYER BOSSES, whose pages share their items", () => {
    expect([...board.deadlocked.values()]).toEqual([]);
    const pets = board.tiles.find((t) => t.name === "PETS")!;
    const [page1, page2] = pets.parts as [PartModel, PartModel];
    expect([...page1.leafIds].sort()).toEqual([...page2.leafIds].sort()); // the same items under both pages
    // A shared item can be claimed before Page 1 is done (it counts toward Page 1), as on the server.
    expect(board.claimable(page2.leafIds[0]!, new Set())).toBe(true);
  });

  it("agrees with the server's gate rule: a gated page opens once its gate is complete, and not before", () => {
    const nightmare = board.tiles.find((t) => t.name === "NIGHTMARE")!;
    const [page1, page2] = nightmare.parts as [PartModel, PartModel];
    const leaf = page2.leafIds[0]!;
    expect(board.claimable(leaf, new Set())).toBe(false);
    expect(board.claimable(leaf, new Set([page1.id]))).toBe(true);
    expect(board.claimable(page1.leafIds[0]!, new Set())).toBe(true);
  });

  it("plans submissions that actually finish every reachable part", () => {
    const rng = new Rng(11);
    for (const part of board.parts) {
      if (board.deadlocked.has(part.id)) continue;
      const plan = planSubmissions(part.node, rng);
      expect(plan.length, `${part.tileName} ${part.label}`).toBeGreaterThan(0);
      const claims = plan.flat();
      for (const submission of plan) {
        expect(new Set(submission.map((c) => c.nodeId)).size).toBe(submission.length);
        expect(submission.every((c) => part.leafIds.includes(c.nodeId))).toBe(true);
      }
      const total = (list: Claim[]) => list.reduce((sum, c) => sum + (c.quantity ?? 1), 0);
      if (part.node.kind === "SUM") expect(total(claims), `${part.tileName} ${part.label}`).toBe(part.node.quantity);
      if (part.node.kind === "COUNT") expect(new Set(claims.map((c) => c.nodeId)).size).toBe(part.node.minCount);
    }
  });

  it("plans the same submissions for a seed", () => {
    const part = board.parts.find((p) => p.tileName === "NIGHTMARE" && p.index === 0)!;
    expect(planSubmissions(part.node, new Rng(4))).toEqual(planSubmissions(part.node, new Rng(4)));
  });

  it("makes TOB ISSUE 2 Page 2 far harder and rarer than most tiles, and slayer bosses easy", () => {
    expect(difficultyOf("TOB ISSUE 2", 1)).toEqual({ effort: 40, eligible: 0.12 });
    expect(difficultyOf("SLAYER BOSSES", 0).eligible).toBeGreaterThan(0.9);
    expect(difficultyOf("Some new tile", 0)).toEqual({ effort: 5, eligible: 0.7 });
  });
});

describe("deadlockedParts", () => {
  const part = (id: string, leafIds: string[]) => ({ id, leafIds, tileName: "T", label: id }) as PartModel;

  it("is empty when the gates open in order", () => {
    const stuck = deadlockedParts([part("a", ["l1"]), part("b", ["l2"])], (leaf, done) => leaf === "l1" || done.has("a"));
    expect(stuck.size).toBe(0);
  });

  it("finds parts each waiting on the other", () => {
    const stuck = deadlockedParts([part("a", ["l1"]), part("b", ["l2"]), part("free", ["l3"])], (leaf, done) => leaf === "l3" || (leaf === "l1" && done.has("b")) || (leaf === "l2" && done.has("a")));
    expect([...stuck.keys()].sort()).toEqual(["a", "b"]);
  });
});

describe("claimable on a board with shared items", () => {
  const item = (id: string, itemName: string): GraphNode => ({ id, bingoId: "b", kind: "ITEM", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, children: [] });
  const part = (id: string, label: string, kind: GraphNode["kind"], children: GraphNode[], gate: string | null = null): GraphNode => ({ ...item(id, ""), kind, label, itemName: null, points: 10, submitGateNodeId: gate, children });
  const tile = (children: GraphNode[]): Tile => ({ id: "t", name: "PETS", boardRow: 0, boardCol: 0, hasFreezePeriod: false, freezeDurationMinutes: 0, node: part("root", "", "ALL", children) }) as unknown as Tile;

  it("allows a shared item while the gated page is locked, and an item only under the gated page once it opens", () => {
    const shared = item("shared", "A");
    const only2 = item("only2", "B");
    const board = buildBoard([tile([part("p1", "Page 1", "COUNT", [shared]), part("p2", "Page 2", "COUNT", [shared, only2], "p1")])], []);
    expect(board.claimable("shared", new Set())).toBe(true);
    expect(board.claimable("only2", new Set())).toBe(false);
    expect(board.claimable("only2", new Set(["p1"]))).toBe(true);
    expect(board.deadlocked.size).toBe(0);
  });

  it("refuses an item shared only by gated pages", () => {
    const shared = item("shared", "A");
    const board = buildBoard([tile([part("p1", "Page 1", "COUNT", [item("other", "Z")]), part("p2", "Page 2", "COUNT", [shared], "p1"), part("p3", "Page 3", "COUNT", [shared], "p1")])], []);
    expect(board.claimable("shared", new Set())).toBe(false);
    expect(board.claimable("shared", new Set(["p1"]))).toBe(true);
  });

  it("checks a gate carried by the item itself", () => {
    const board = buildBoard([tile([part("p1", "Page 1", "COUNT", [item("first", "A")]), { ...item("second", "B"), submitGateNodeId: "first" }])], []);
    expect(board.claimable("second", new Set())).toBe(false);
    expect(board.claimable("second", new Set(["first"]))).toBe(true);
  });
});

describe("exclusive items on the board", () => {
  const item = (id: string, itemName: string): GraphNode => ({ id, bingoId: "b", kind: "ITEM", label: null, description: null, notes: null, points: 0, minCount: null, quantity: null, itemName, pointsGateNodeId: null, submitGateNodeId: null, allowsPreLoad: false, children: [] });
  const part = (id: string, label: string, children: GraphNode[]): GraphNode => ({ ...item(id, ""), kind: "SUM", label, itemName: null, quantity: 1, points: 10, children });
  const tile = (id: string, name: string, col: number, parts: GraphNode[]): Tile => ({ id, name, boardRow: 0, boardCol: col, hasFreezePeriod: false, freezeDurationMinutes: 0, node: { ...part(`${id}-root`, "", parts), kind: "ALL" } }) as unknown as Tile;
  const tiles = [tile("zul", "ZULRAH", 0, [part("z1", "Page 1", [item("zul-snake", "Pet snakeling")])]), tile("pets", "PETS", 1, [part("p1", "Page 1", [item("pets-snake", "Pet snakeling"), item("pets-nid", "Nid")])])];
  const rules = [{ id: "pets", label: "Pets", itemNames: ["Pet snakeling", "Nid"], scope: "tile" as const }];

  it("locks an item the team already used on another tile, and only that one", () => {
    const board = buildBoard(tiles, [], rules);
    const [conflict] = board.exclusivityConflicts(["zul-snake"], ["pets-snake"]);
    expect(conflict).toMatchObject({ nodeId: "pets-snake", usedOn: "ZULRAH" });
    expect(board.exclusivityConflicts(["zul-snake"], ["pets-nid"])).toEqual([]);
    expect(board.exclusivityConflicts([], ["pets-snake"])).toEqual([]);
  });

  it("has nothing to check without rules", () => {
    expect(buildBoard(tiles, []).exclusivityConflicts(["zul-snake"], ["pets-snake"])).toEqual([]);
  });
});

describe("answerQuestions", () => {
  const question = (over: Partial<SignupQuestion> & Pick<SignupQuestion, "id" | "prompt" | "type">): SignupQuestion =>
    ({ bingoId: "b", helperText: null, optionsJson: null, required: false, sortOrder: 0, ...over }) as SignupQuestion;
  const QUESTIONS: SignupQuestion[] = [
    question({ id: "captain", prompt: "Interested in captaining?", type: "select", optionsJson: JSON.stringify(["Yes", "No", "Maybe"]) }),
    question({ id: "tz", prompt: "What time zone and/or country are you in?", type: "text", required: true }),
    question({ id: "bosses", prompt: "Which bosses?", type: "multiselect", optionsJson: JSON.stringify(["Vorkath", "Zulrah", "Hydra", "Nex"]), required: true }),
    question({ id: "terms", prompt: 'Please read the terms below and write "yes" in the response box to agree', type: "text", required: true }),
    question({ id: "free", prompt: "Anything else?", type: "textarea" }),
    question({ id: "flag", prompt: "Have a mic?", type: "boolean", required: true }),
  ];
  const players = makePlayers(new Rng(3), 60, "testdata-x");

  it("answers every required question, whoever the player is", () => {
    for (const player of players) {
      const answers = new Map(answerQuestions(QUESTIONS, player, new Rng(player.index)).map((a) => [a.questionId, a.value]));
      for (const q of QUESTIONS.filter((x) => x.required)) expect(isBlankAnswer(q.type, answers.get(q.id)), `${q.id} for player ${player.index}`).toBe(false);
    }
  });

  it("gives an exact 'yes' to a question that asks for one, and the player's own time zone", () => {
    const player = { ...players[0]!, offset: -5 };
    const answers = new Map(answerQuestions(QUESTIONS, player, new Rng(1)).map((a) => [a.questionId, a.value]));
    expect(answers.get("terms")).toBe("yes");
    expect(answers.get("tz")).toBe("UTC-5");
    expect(answerQuestions(QUESTIONS, { ...player, offset: 0 }, new Rng(1)).find((a) => a.questionId === "tz")!.value).toBe("UTC");
    expect(answerQuestions(QUESTIONS, { ...player, offset: 2 }, new Rng(1)).find((a) => a.questionId === "tz")!.value).toBe("UTC+2");
  });

  it("picks real options: one for a single choice, a list in the question's order for multiple choice", () => {
    for (const player of players) {
      const answers = new Map(answerQuestions(QUESTIONS, player, new Rng(player.index)).map((a) => [a.questionId, a.value]));
      const captain = answers.get("captain")!;
      expect(captain === "" || ["Yes", "No", "Maybe"].includes(captain)).toBe(true);
      const bosses = parseChoices(answers.get("bosses"));
      expect(bosses.length).toBeGreaterThan(0);
      const order = ["Vorkath", "Zulrah", "Hydra", "Nex"];
      expect(bosses.every((b) => order.includes(b))).toBe(true);
      expect(bosses).toEqual(order.filter((o) => bosses.includes(o)));
      expect(new Set(bosses).size).toBe(bosses.length);
      expect(["true", "false"]).toContain(answers.get("flag"));
    }
  });

  it("leaves some optional questions blank, and stronger players tick more choices", () => {
    const all = players.flatMap((p) => answerQuestions(QUESTIONS, p, new Rng(p.index)).filter((a) => a.questionId === "free"));
    expect(all.some((a) => a.value === "")).toBe(true);
    expect(all.some((a) => a.value !== "")).toBe(true);
    const count = (skill: number) => {
      const strong = { ...players[0]!, skill };
      const totals = Array.from({ length: 200 }, (_, i) => parseChoices(answerQuestions(QUESTIONS, strong, new Rng(i)).find((a) => a.questionId === "bosses")!.value).length);
      return totals.reduce((a, b) => a + b, 0) / totals.length;
    };
    expect(count(0.9)).toBeGreaterThan(count(0.1));
  });

  it("is the same for the same player and seed, and doesn't depend on other players", () => {
    const player = players[7]!;
    expect(answerQuestions(QUESTIONS, player, new Rng(5))).toEqual(answerQuestions(QUESTIONS, player, new Rng(5)));
    expect(answerQuestions([], player, new Rng(5))).toEqual([]);
  });
});

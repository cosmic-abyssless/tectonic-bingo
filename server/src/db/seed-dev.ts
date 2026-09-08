// Dev-only seed: one admin user + one demo bingo exercising every node kind
// and gate on a small 3x3 board, plus sample submissions in every review
// state. Production boards are authored in the admin panel — this script
// exists purely so local dev/testing has data to work against.
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { GraphNode, GraphNodeInput } from '@bingo/shared';
import { db } from './index';
import {
  users, bingos, bingoModerators, tileCategories,
  teams, teamMembers,
  signupQuestions, itemGroups, itemGroupItems,
} from './schema';
import { createTile, createTask, generateLines } from '../services/boardService';
import { getNodeTree } from '../services/graphService';
import { createSubmission } from '../services/submissionService';
import { approveSubmission, rejectSubmission } from '../services/scoringService';

async function main() {
  const [admin] = await db.insert(users).values({
    discordId: 'dev-admin',
    discordUsername: 'dev_admin',
    isAdmin: true,
  }).returning();

  const [captainA] = await db.insert(users).values({ discordId: 'dev-captain-a', discordUsername: 'captain_alpha' }).returning();
  const [memberA] = await db.insert(users).values({ discordId: 'dev-member-a', discordUsername: 'member_alpha' }).returning();
  const [captainB] = await db.insert(users).values({ discordId: 'dev-captain-b', discordUsername: 'captain_beta' }).returning();
  const [memberB] = await db.insert(users).values({ discordId: 'dev-member-b', discordUsername: 'member_beta' }).returning();

  const now = new Date();
  const [bingo] = await db.insert(bingos).values({
    slug: 'demo',
    name: 'Demo Bingo',
    description: 'A small 3x3 board covering every node kind and gate, for local dev/testing.',
    theme: 'default',
    stage: 'live',
    boardRows: 3,
    boardCols: 3,
    buyinAmount: 10_000_000,
    bonusPotAmount: 50_000_000,
    rulesMarkdown: '# Demo Bingo Rules\n\nThis is seed data for local development.',
    signupOpensAt: now,
    draftScheduledAt: now,
    revealScheduledAt: now,
    startsAt: now,
    endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    createdByUserId: admin.id,
  }).returning();

  await db.insert(bingoModerators).values({ bingoId: bingo.id, userId: admin.id });

  const categoryDefs = [
    { label: 'Bosses', colorHex: '#e74c3c', sortOrder: 0 },
    { label: 'Group Content', colorHex: '#8e44ad', sortOrder: 1 },
    { label: 'Skilling', colorHex: '#27ae60', sortOrder: 2 },
  ];
  const categories = [];
  for (const c of categoryDefs) {
    const [row] = await db.insert(tileCategories).values({ bingoId: bingo.id, ...c }).returning();
    categories.push(row);
  }

  // Reusable item group (global, not bingo-scoped, not referenced by any
  // node — picking it in the admin UI expands it into plain ITEM leaves at
  // authoring time; see docs/item-quantity-model.md §6). Seeded purely so
  // the admin's item-or-group search has something to find.
  const [cerbGroup] = await db.insert(itemGroups).values({ name: 'Cerberus uniques', description: 'Any Cerberus unique drop.' }).returning();
  await db.insert(itemGroupItems).values(
    ['Primordial crystal', 'Pegasian crystal', 'Eternal crystal', 'Smouldering stone', 'Hellpuppy', 'Jar of souls'].map((itemName) => ({ groupId: cerbGroup.id, itemName })),
  );
  const CERB_UNIQUES = ['Primordial crystal', 'Pegasian crystal', 'Eternal crystal', 'Smouldering stone', 'Hellpuppy', 'Jar of souls'];

  // A single-name leaf — the smallest unit; "how many" is always decided by
  // whatever wraps it (SUM/COUNT), never by the leaf itself.
  const item = (itemName: string, extra: Partial<GraphNodeInput> = {}): GraphNodeInput => ({ kind: 'ITEM', itemName, ...extra });
  // "N total, duplicates count" — a SUM over one leaf per name.
  const sum = (quantity: number, itemNames: string[], extra: Partial<GraphNodeInput> = {}): GraphNodeInput => ({
    kind: 'SUM', quantity, children: itemNames.map((n) => item(n)), ...extra,
  });

  interface TaskDef {
    label: string;
    points: number;
    description: string;
    scoringMode?: 'automatic' | 'manual';
    submitRequiresPrevious?: boolean;
    pointsRequirePrevious?: boolean;
    allowsPreLoad?: boolean;
    requirement?: GraphNodeInput;
  }

  // Each task is a node (label/points/description + gates + a requirement
  // shape). Covers every node kind: ALL, ANY, COUNT, SUM, ITEM and MANUAL.
  const tileDefs: Array<{
    row: number; col: number; categoryIndex: number; name: string;
    hasFreezePeriod?: boolean; freezeDurationMinutes?: number;
    tasks: TaskDef[];
  }> = [
    {
      row: 0, col: 0, categoryIndex: 0, name: 'Vorkath',
      tasks: [
        { label: 'Part A', points: 25, description: 'Obtain a Vorki pet.', requirement: item('Vorki') },
        { label: 'Part B', points: 35, description: 'Obtain a Draconic visage.', pointsRequirePrevious: true, requirement: item('Draconic visage') },
      ],
    },
    {
      row: 0, col: 1, categoryIndex: 0, name: 'Zulrah',
      tasks: [{
        label: 'Part A', points: 50, description: 'Obtain a Tanzanite fang and a Magic fang.',
        requirement: { kind: 'ALL', children: [item('Tanzanite fang'), item('Magic fang')] },
      }],
    },
    {
      row: 0, col: 2, categoryIndex: 0, name: 'Cerberus',
      tasks: [
        // "Any one unique" = SUM(1) over one leaf per name — the jar is just
        // one more leaf, no wildcard needed (see docs/item-quantity-model.md §7).
        { label: 'Part A', points: 25, description: 'Obtain your first Cerberus unique.', requirement: sum(1, CERB_UNIQUES) },
        { label: 'Part B', points: 40, description: 'Obtain another Cerberus unique.', submitRequiresPrevious: true, requirement: sum(1, CERB_UNIQUES) },
      ],
    },
    {
      row: 1, col: 0, categoryIndex: 1, name: 'Barrows',
      tasks: [{
        label: 'Part A', points: 30, description: 'Obtain a complete set from one brother.',
        requirement: {
          kind: 'ANY',
          children: [
            { kind: 'ALL', children: ["Ahrim's hood", "Ahrim's robetop", "Ahrim's robeskirt", "Ahrim's staff"].map((n) => item(n)) },
            { kind: 'ALL', children: ["Dharok's helm", "Dharok's platebody", "Dharok's platelegs", "Dharok's greataxe"].map((n) => item(n)) },
          ],
        },
      }],
    },
    {
      row: 1, col: 1, categoryIndex: 1, name: "K'ril Tsutsaroth",
      tasks: [{
        label: 'Part A', points: 25, description: 'Obtain two different unique drops.',
        // "2 distinct" = COUNT(2) over one leaf per unique name — replaces
        // the old distinctItems flag; see docs/item-quantity-model.md §2.
        requirement: { kind: 'COUNT', minCount: 2, children: ['Steam battlestaff', 'Zamorakian spear', 'Zamorak hilt'].map((n) => item(n)) },
      }],
    },
    {
      row: 1, col: 2, categoryIndex: 1, name: 'Gauntlet',
      tasks: [{
        label: 'Part A', points: 35, description: 'Obtain 3 Crystal armour seeds (duplicates count).', allowsPreLoad: true,
        // The flagship SUM case: "N of one exact item" — SUM(3) over a
        // single leaf, not a quantity on the leaf itself.
        requirement: sum(3, ['Crystal armour seed']),
      }],
    },
    {
      row: 2, col: 0, categoryIndex: 2, name: 'Colosseum',
      hasFreezePeriod: true, freezeDurationMinutes: 120,
      tasks: [
        { label: 'Waves 1-3', points: 20, description: 'Clear waves 1 through 3.', requirement: item('Waves 1-3 proof') },
        { label: 'Waves 4-6', points: 20, description: 'Clear waves 4 through 6.', submitRequiresPrevious: true, requirement: item('Waves 4-6 proof') },
        { label: 'Waves 7-Sol', points: 20, description: 'Clear waves 7 through Sol Heredit.', submitRequiresPrevious: true, requirement: item('Colosseum completion proof') },
      ],
    },
    {
      row: 2, col: 1, categoryIndex: 2, name: 'Wintertodt',
      tasks: [{
        label: 'Part A', points: 20, description: 'Obtain any two of: Bruma torch, Pyromancer hood, Warm gloves.',
        requirement: { kind: 'COUNT', minCount: 2, children: ['Bruma torch', 'Pyromancer hood', 'Warm gloves'].map((n) => item(n)) },
      }],
    },
    {
      // Manual-scoring example: a one-off custom challenge with no item list
      // to codify. The task node itself is a bare MANUAL leaf — approving a
      // submission's claim on it IS the mod's completion decision.
      row: 2, col: 2, categoryIndex: 2, name: 'Custom Challenge: GOTR Speedrun',
      tasks: [{
        label: 'Part A', points: 20, scoringMode: 'manual',
        description: 'Complete a Guardians of the Rift run in under 6 minutes. Submit a screenshot of the post-game reward screen showing the completion time — a mod will judge and award points manually.',
      }],
    },
  ];

  // "Tile name/Task label" -> task node id, for wiring sample submissions.
  const taskIdByKey: Record<string, string> = {};

  for (const def of tileDefs) {
    const tile = createTile(db, {
      bingoId: bingo.id,
      name: def.name,
      categoryId: categories[def.categoryIndex]!.id,
      boardRow: def.row,
      boardCol: def.col,
      hasFreezePeriod: def.hasFreezePeriod ?? false,
      freezeDurationMinutes: def.freezeDurationMinutes ?? 0,
    });

    // submitRequiresPrevious/pointsRequirePrevious resolve to the previous
    // sibling task's node id — the admin client will do this same resolution
    // against the tile's current child order (see docs/node-graph-model.md §6).
    let prevTaskNodeId: string | undefined;
    for (const taskDef of def.tasks) {
      const base: GraphNodeInput = taskDef.requirement ?? { kind: taskDef.scoringMode === 'manual' ? 'MANUAL' : 'ALL' };
      const input: GraphNodeInput = {
        ...base,
        label: taskDef.label,
        description: taskDef.description,
        points: taskDef.points,
        allowsPreLoad: taskDef.allowsPreLoad ?? false,
        submitGateNodeId: taskDef.submitRequiresPrevious ? prevTaskNodeId : undefined,
        pointsGateNodeId: taskDef.pointsRequirePrevious ? prevTaskNodeId : undefined,
      };
      const task = createTask(db, tile.id, input);
      taskIdByKey[`${def.name}/${taskDef.label}`] = task.id;
      prevTaskNodeId = task.id;
    }
  }

  // Rows + cols + both diagonals for the 3x3 board.
  generateLines(db, bingo, 15);

  const [teamAlpha] = await db.insert(teams).values({
    bingoId: bingo.id, captainUserId: captainA.id, name: "Alpha's Team", codeword: 'crimson-falcon', color: '#e74c3c',
  }).returning();
  await db.insert(teamMembers).values([
    { teamId: teamAlpha.id, userId: captainA.id, isCaptain: true },
    { teamId: teamAlpha.id, userId: memberA.id, isCaptain: false },
  ]);

  const [teamBeta] = await db.insert(teams).values({
    bingoId: bingo.id, captainUserId: captainB.id, name: "Beta's Team", codeword: 'azure-wolf', color: '#3498db',
  }).returning();
  await db.insert(teamMembers).values([
    { teamId: teamBeta.id, userId: captainB.id, isCaptain: true },
    { teamId: teamBeta.id, userId: memberB.id, isCaptain: false },
  ]);

  await db.insert(signupQuestions).values([
    { bingoId: bingo.id, prompt: 'What is your preferred combat style?', type: 'select', optionsJson: JSON.stringify(['Melee', 'Ranged', 'Magic']), required: true, sortOrder: 0 },
    { bingoId: bingo.id, prompt: 'Are you available on weekends?', type: 'boolean', required: false, sortOrder: 1 },
    { bingoId: bingo.id, prompt: 'Anything else we should know?', type: 'textarea', required: false, sortOrder: 2 },
  ]);

  // Sample submissions in every review state, created through the real
  // services so completion/points/lines are derived exactly as in production.
  // Reuses the e2e fixture screenshot so the images actually render.
  const uploadsDir = path.join(__dirname, '../../uploads');
  mkdirSync(uploadsDir, { recursive: true });
  copyFileSync(path.join(__dirname, '../../../e2e/fixtures/screenshot.png'), path.join(uploadsDir, 'seed-screenshot.png'));
  const screenshotUrl = '/uploads/seed-screenshot.png';

  function collectLeaves(node: GraphNode): GraphNode[] {
    if (node.kind === 'ITEM' || node.kind === 'MANUAL') return [node];
    return node.children.flatMap(collectLeaves);
  }
  // Leaf ids of a task in tree order; single-leaf tasks use leaves(...)[0].
  const leaves = (key: string) => collectLeaves(getNodeTree(db, taskIdByKey[key]!)!).map((n) => n.id);
  const submit = (teamId: string, submittedByUserId: string, claims: Parameters<typeof createSubmission>[2]['claims']) =>
    createSubmission(db, bingo, { teamId, submittedByUserId, claims, screenshotUrl });

  // Alpha: Vorkath A approved (complete), Vorkath B pending, Zulrah one of two
  // fangs approved (in progress), Wintertodt rejected.
  const alphaVorki = submit(teamAlpha.id, memberA.id, [{ nodeId: leaves('Vorkath/Part A')[0]!, itemName: 'Vorki' }]);
  approveSubmission(db, { submissionId: alphaVorki.id, reviewedByUserId: admin.id });
  submit(teamAlpha.id, captainA.id, [{ nodeId: leaves('Vorkath/Part B')[0]!, itemName: 'Draconic visage' }]);
  const alphaFang = submit(teamAlpha.id, memberA.id, [{ nodeId: leaves('Zulrah/Part A')[0]!, itemName: 'Tanzanite fang' }]);
  approveSubmission(db, { submissionId: alphaFang.id, reviewedByUserId: admin.id });
  const alphaTodt = submit(teamAlpha.id, memberA.id, [{ nodeId: leaves('Wintertodt/Part A')[0]!, itemName: 'Bruma torch' }]);
  rejectSubmission(db, { submissionId: alphaTodt.id, reviewedByUserId: admin.id, reviewerNotes: 'Screenshot does not show the team codeword.' });

  // Beta: one screenshot claiming two Wintertodt leaves at once (complete),
  // Cerberus A via the jar (just one more leaf in the SUM(1), not a
  // wildcard), GOTR manual pending.
  const betaTodt = submit(teamBeta.id, memberB.id, [
    { nodeId: leaves('Wintertodt/Part A')[0]!, itemName: 'Bruma torch' },
    { nodeId: leaves('Wintertodt/Part A')[2]!, itemName: 'Warm gloves' },
  ]);
  approveSubmission(db, { submissionId: betaTodt.id, reviewedByUserId: admin.id });
  const betaCerb = submit(teamBeta.id, captainB.id, [{ nodeId: leaves('Cerberus/Part A')[5]!, itemName: 'Jar of souls' }]);
  approveSubmission(db, { submissionId: betaCerb.id, reviewedByUserId: admin.id });
  submit(teamBeta.id, memberB.id, [{ nodeId: leaves('Custom Challenge: GOTR Speedrun/Part A')[0]! }]);

  console.log(`Seeded bingo "${bingo.name}" (slug: ${bingo.slug}) with ${tileDefs.length} tiles, 2 teams, 8 lines, 7 sample submissions.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

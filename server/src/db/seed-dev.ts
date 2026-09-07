// Dev-only seed: one admin user + one demo bingo exercising every requirement
// node kind and task flag on a small 3x3 board, plus sample submissions in
// every review state. Production boards are authored in the admin panel —
// this script exists purely so local dev/testing has data to work against.
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { db } from './index';
import {
  users, bingos, bingoModerators, tileCategories, tiles,
  tileWildcards, bingoLines, bingoLineTiles, teams, teamMembers,
  signupQuestions, itemGroups, itemGroupItems,
} from './schema';
import { createTask, type CreateTaskParams } from '../services/boardService';
import { getRequirementTree, leafIds, type RequirementNodeInput } from '../services/requirementService';
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
    description: 'A small 3x3 board covering every tile-task rule flag, for local dev/testing.',
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

  // Reusable item groups (global, not bingo-scoped).
  const [cerbGroup] = await db.insert(itemGroups).values({ name: 'Cerberus uniques', description: 'Any Cerberus unique drop.' }).returning();
  await db.insert(itemGroupItems).values(
    ['Primordial crystal', 'Pegasian crystal', 'Eternal crystal', 'Smouldering stone', 'Hellpuppy', 'Jar of souls'].map((itemName) => ({ groupId: cerbGroup.id, itemName })),
  );

  const item = (itemNames: string[], extra: Partial<RequirementNodeInput> = {}): RequirementNodeInput => ({ kind: 'ITEM', itemNames, ...extra });

  // Each task: label/points/description + flags + a requirement tree. Covers
  // every node kind: ALL, ANY, COUNT, ITEM (inline names, group, quantity,
  // distinctItems) and MANUAL.
  const tileDefs: Array<{
    row: number; col: number; categoryIndex: number; name: string;
    hasFreezePeriod?: boolean; freezeDurationMinutes?: number;
    tasks: Array<Omit<CreateTaskParams, 'tileId' | 'sortOrder'>>;
  }> = [
    {
      row: 0, col: 0, categoryIndex: 0, name: 'Vorkath',
      tasks: [
        { label: 'Part A', points: 25, description: 'Obtain a Vorki pet.', requirement: item(['Vorki']) },
        { label: 'Part B', points: 35, description: 'Obtain a Draconic visage.', pointsRequirePrevious: true, requirement: item(['Draconic visage']) },
      ],
    },
    {
      row: 0, col: 1, categoryIndex: 0, name: 'Zulrah',
      tasks: [{
        label: 'Part A', points: 50, description: 'Obtain a Tanzanite fang and a Magic fang.',
        requirement: { kind: 'ALL', children: [item(['Tanzanite fang']), item(['Magic fang'])] },
      }],
    },
    {
      row: 0, col: 2, categoryIndex: 0, name: 'Cerberus',
      tasks: [
        { label: 'Part A', points: 25, description: 'Obtain your first Cerberus unique.', requirement: item([], { itemGroupId: cerbGroup.id }) },
        { label: 'Part B', points: 40, description: 'Obtain another Cerberus unique.', submitRequiresPrevious: true, requirement: item([], { itemGroupId: cerbGroup.id }) },
      ],
    },
    {
      row: 1, col: 0, categoryIndex: 1, name: 'Barrows',
      tasks: [{
        label: 'Part A', points: 30, description: 'Obtain a complete set from one brother.',
        requirement: {
          kind: 'ANY',
          children: [
            { kind: 'ALL', children: ["Ahrim's hood", "Ahrim's robetop", "Ahrim's robeskirt", "Ahrim's staff"].map((n) => item([n])) },
            { kind: 'ALL', children: ["Dharok's helm", "Dharok's platebody", "Dharok's platelegs", "Dharok's greataxe"].map((n) => item([n])) },
          ],
        },
      }],
    },
    {
      row: 1, col: 1, categoryIndex: 1, name: "K'ril Tsutsaroth",
      tasks: [{
        label: 'Part A', points: 25, description: 'Obtain two different unique drops.',
        requirement: item(['Steam battlestaff', 'Zamorakian spear', 'Zamorak hilt'], { quantity: 2, distinctItems: true }),
      }],
    },
    {
      row: 1, col: 2, categoryIndex: 1, name: 'Gauntlet',
      tasks: [{ label: 'Part A', points: 35, description: 'Complete the Gauntlet.', allowsPreLoad: true, requirement: item(['Crystal armour seed']) }],
    },
    {
      row: 2, col: 0, categoryIndex: 2, name: 'Colosseum',
      hasFreezePeriod: true, freezeDurationMinutes: 120,
      tasks: [
        { label: 'Waves 1-3', points: 20, description: 'Clear waves 1 through 3.', requirement: item(['Waves 1-3 proof']) },
        { label: 'Waves 4-6', points: 20, description: 'Clear waves 4 through 6.', submitRequiresPrevious: true, requirement: item(['Waves 4-6 proof']) },
        { label: 'Waves 7-Sol', points: 20, description: 'Clear waves 7 through Sol Heredit.', submitRequiresPrevious: true, requirement: item(['Colosseum completion proof']) },
      ],
    },
    {
      row: 2, col: 1, categoryIndex: 2, name: 'Wintertodt',
      tasks: [{
        label: 'Part A', points: 20, description: 'Obtain any two of: Bruma torch, Pyromancer hood, Warm gloves.',
        requirement: { kind: 'COUNT', minCount: 2, children: [item(['Bruma torch']), item(['Pyromancer hood']), item(['Warm gloves'])] },
      }],
    },
    {
      // Manual-scoring example: a one-off custom challenge with no item list
      // to codify. Mods judge the screenshot directly and decide completion
      // + points when reviewing each submission.
      row: 2, col: 2, categoryIndex: 2, name: 'Custom Challenge: GOTR Speedrun',
      tasks: [{
        label: 'Part A', points: 20, scoringMode: 'manual',
        description: 'Complete a Guardians of the Rift run in under 6 minutes. Submit a screenshot of the post-game reward screen showing the completion time — a mod will judge and award points manually.',
      }],
    },
  ];

  const tileRowsById: Record<string, { id: string }> = {};
  // "Tile name/Task label" -> task id, for wiring wildcards and sample submissions.
  const taskIdByKey: Record<string, string> = {};

  for (const def of tileDefs) {
    const [tile] = await db.insert(tiles).values({
      bingoId: bingo.id,
      name: def.name,
      categoryId: categories[def.categoryIndex].id,
      boardRow: def.row,
      boardCol: def.col,
      hasFreezePeriod: def.hasFreezePeriod ?? false,
      freezeDurationMinutes: def.freezeDurationMinutes ?? 0,
    }).returning();
    tileRowsById[`${def.row},${def.col}`] = tile;

    for (const [i, taskDef] of def.tasks.entries()) {
      const task = createTask(db, { tileId: tile.id, sortOrder: i, ...taskDef });
      taskIdByKey[`${def.name}/${taskDef.label}`] = task.id;
    }
  }

  const [cerbWildcard] = await db.insert(tileWildcards).values({
    tileId: tileRowsById['0,2'].id,
    itemName: 'Cerberus jar',
    maxRedemptionsPerTeam: 1,
    description: 'Redeeming a Cerberus jar counts as a Cerberus unique for Part A.',
    applicableNodeId: getRequirementTree(db, taskIdByKey['Cerberus/Part A'])!.id,
  }).returning();

  // Generate all lines for a 3x3 board: 3 rows + 3 cols + 2 diagonals.
  for (let row = 0; row < 3; row++) {
    const [line] = await db.insert(bingoLines).values({ bingoId: bingo.id, lineType: 'row', lineIndex: row, points: 15 }).returning();
    for (let col = 0; col < 3; col++) {
      await db.insert(bingoLineTiles).values({ bingoLineId: line.id, tileId: tileRowsById[`${row},${col}`].id });
    }
  }
  for (let col = 0; col < 3; col++) {
    const [line] = await db.insert(bingoLines).values({ bingoId: bingo.id, lineType: 'column', lineIndex: col, points: 15 }).returning();
    for (let row = 0; row < 3; row++) {
      await db.insert(bingoLineTiles).values({ bingoLineId: line.id, tileId: tileRowsById[`${row},${col}`].id });
    }
  }
  const [diagTlBr] = await db.insert(bingoLines).values({ bingoId: bingo.id, lineType: 'diagonal', lineIndex: 0, points: 15 }).returning();
  for (let i = 0; i < 3; i++) {
    await db.insert(bingoLineTiles).values({ bingoLineId: diagTlBr.id, tileId: tileRowsById[`${i},${i}`].id });
  }
  const [diagTrBl] = await db.insert(bingoLines).values({ bingoId: bingo.id, lineType: 'diagonal', lineIndex: 1, points: 15 }).returning();
  for (let i = 0; i < 3; i++) {
    await db.insert(bingoLineTiles).values({ bingoLineId: diagTrBl.id, tileId: tileRowsById[`${i},${2 - i}`].id });
  }

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
  // services so progress/points/lines are derived exactly as in production.
  // Reuses the e2e fixture screenshot so the images actually render.
  const uploadsDir = path.join(__dirname, '../../uploads');
  mkdirSync(uploadsDir, { recursive: true });
  copyFileSync(path.join(__dirname, '../../../e2e/fixtures/screenshot.png'), path.join(uploadsDir, 'seed-screenshot.png'));
  const screenshotUrl = '/uploads/seed-screenshot.png';

  // Leaf ids of a task in tree order; single-leaf tasks use leaves(...)[0].
  const leaves = (key: string) => leafIds(getRequirementTree(db, taskIdByKey[key])!);
  const submit = (teamId: string, submittedByUserId: string, claims: Parameters<typeof createSubmission>[2]['claims']) =>
    createSubmission(db, bingo, { teamId, submittedByUserId, claims, screenshotUrl });

  // Alpha: Vorkath A approved (complete), Vorkath B pending, Zulrah one of two
  // fangs approved (in progress), Wintertodt rejected.
  const alphaVorki = submit(teamAlpha.id, memberA.id, [{ nodeId: leaves('Vorkath/Part A')[0], itemName: 'Vorki' }]);
  approveSubmission(db, { submissionId: alphaVorki.id, reviewedByUserId: admin.id });
  submit(teamAlpha.id, captainA.id, [{ nodeId: leaves('Vorkath/Part B')[0], itemName: 'Draconic visage' }]);
  const alphaFang = submit(teamAlpha.id, memberA.id, [{ nodeId: leaves('Zulrah/Part A')[0], itemName: 'Tanzanite fang' }]);
  approveSubmission(db, { submissionId: alphaFang.id, reviewedByUserId: admin.id });
  const alphaTodt = submit(teamAlpha.id, memberA.id, [{ nodeId: leaves('Wintertodt/Part A')[0], itemName: 'Bruma torch' }]);
  rejectSubmission(db, { submissionId: alphaTodt.id, reviewedByUserId: admin.id, reviewerNotes: 'Screenshot does not show the team codeword.' });

  // Beta: one screenshot claiming two Wintertodt leaves at once (complete),
  // Cerberus A via the jar wildcard (complete), GOTR manual pending.
  const betaTodt = submit(teamBeta.id, memberB.id, [
    { nodeId: leaves('Wintertodt/Part A')[0], itemName: 'Bruma torch' },
    { nodeId: leaves('Wintertodt/Part A')[2], itemName: 'Warm gloves' },
  ]);
  approveSubmission(db, { submissionId: betaTodt.id, reviewedByUserId: admin.id });
  const betaCerb = submit(teamBeta.id, captainB.id, [{ nodeId: leaves('Cerberus/Part A')[0], itemName: 'Cerberus jar', wildcardId: cerbWildcard.id }]);
  approveSubmission(db, { submissionId: betaCerb.id, reviewedByUserId: admin.id });
  submit(teamBeta.id, memberB.id, [{ nodeId: leaves('Custom Challenge: GOTR Speedrun/Part A')[0] }]);

  console.log(`Seeded bingo "${bingo.name}" (slug: ${bingo.slug}) with ${tileDefs.length} tiles, 2 teams, 8 lines, 7 sample submissions.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

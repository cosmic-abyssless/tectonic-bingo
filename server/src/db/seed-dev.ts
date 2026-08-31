// Dev-only seed: one admin user + one demo bingo exercising every tile-task
// rule flag on a small 3x3 board. Production boards are authored in the admin
// panel (Phase 5) — this script exists purely so local dev/testing has data
// to work against.
import { db } from './index';
import {
  users, bingos, bingoModerators, tileCategories, tiles, tileTasks,
  tileTaskItems, tileWildcards, bingoLines, bingoLineTiles, teams, teamMembers,
  signupQuestions,
} from './schema';

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
    potAmount: 300_000_000,
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

  // (row, col, categoryIndex, name, tasks[])
  // Each task: { label, points, description, items: [{itemName, quantity, optionsGroup}], ...flags }
  const tileDefs: Array<{
    row: number; col: number; categoryIndex: number; name: string;
    hasFreezePeriod?: boolean; freezeDurationMinutes?: number;
    tasks: Array<{
      label: string; points: number; description: string;
      scoringMode?: 'automatic' | 'manual';
      submitRequiresPrevious?: boolean; pointsRequirePrevious?: boolean;
      requiresNoDuplicates?: boolean; allowsPreviouslyAcquired?: boolean;
      allowsPreLoad?: boolean; minSubmissions?: number; requiresCompleteSet?: boolean;
      items: Array<{ itemName: string; quantity?: number; optionsGroup?: string }>;
    }>;
  }> = [
    {
      row: 0, col: 0, categoryIndex: 0, name: 'Vorkath',
      tasks: [
        { label: 'Part A', points: 25, description: 'Obtain a Vorki pet or Draconic visage.', items: [{ itemName: 'Vorki' }] },
        {
          label: 'Part B', points: 35, description: 'Obtain a second unique drop.', pointsRequirePrevious: true,
          items: [{ itemName: 'Draconic visage' }],
        },
      ],
    },
    {
      row: 0, col: 1, categoryIndex: 0, name: 'Zulrah',
      tasks: [
        {
          label: 'Part A', points: 50, description: 'Obtain a Tanzanite fang and a Magic fang.', requiresNoDuplicates: true,
          items: [{ itemName: 'Tanzanite fang' }, { itemName: 'Magic fang' }],
        },
      ],
    },
    {
      row: 0, col: 2, categoryIndex: 0, name: 'Cerberus',
      tasks: [
        { label: 'Part A', points: 25, description: 'Obtain your first Cerberus drop.', items: [{ itemName: 'Any Cerberus drop' }] },
        {
          label: 'Part B', points: 40, description: 'Obtain two more Cerberus drops (drops from Part A count).', allowsPreviouslyAcquired: true,
          items: [{ itemName: 'Any Cerberus drop', quantity: 2 }],
        },
      ],
    },
    {
      row: 1, col: 0, categoryIndex: 1, name: 'Barrows',
      tasks: [
        {
          label: 'Part A', points: 30, description: 'Obtain a complete set from one brother.', requiresCompleteSet: true,
          items: [
            { itemName: "Ahrim's hood", optionsGroup: 'ahrim' },
            { itemName: "Ahrim's robetop", optionsGroup: 'ahrim' },
            { itemName: "Ahrim's robeskirt", optionsGroup: 'ahrim' },
            { itemName: "Ahrim's staff", optionsGroup: 'ahrim' },
            { itemName: "Dharok's helm", optionsGroup: 'dharok' },
            { itemName: "Dharok's platebody", optionsGroup: 'dharok' },
            { itemName: "Dharok's platelegs", optionsGroup: 'dharok' },
            { itemName: "Dharok's greataxe", optionsGroup: 'dharok' },
          ],
        },
      ],
    },
    {
      row: 1, col: 1, categoryIndex: 1, name: "K'ril Tsutsaroth",
      tasks: [
        {
          label: 'Part A', points: 25, description: 'Obtain two different unique drops.', minSubmissions: 2,
          items: [
            { itemName: 'Steam battlestaff', optionsGroup: 'drop' },
            { itemName: 'Zamorakian spear', optionsGroup: 'drop' },
            { itemName: 'Zamorak hilt', optionsGroup: 'drop' },
          ],
        },
      ],
    },
    {
      row: 1, col: 2, categoryIndex: 1, name: 'Gauntlet',
      tasks: [
        {
          label: 'Part A', points: 35, description: 'Complete the Gauntlet.', allowsPreLoad: true,
          items: [{ itemName: 'Crystal armour seed' }],
        },
      ],
    },
    {
      row: 2, col: 0, categoryIndex: 2, name: 'Colosseum',
      hasFreezePeriod: true, freezeDurationMinutes: 120,
      tasks: [
        { label: 'Waves 1-3', points: 20, description: 'Clear waves 1 through 3.', items: [{ itemName: 'Waves 1-3 proof' }] },
        { label: 'Waves 4-6', points: 20, description: 'Clear waves 4 through 6.', submitRequiresPrevious: true, items: [{ itemName: 'Waves 4-6 proof' }] },
        { label: 'Waves 7-Sol', points: 20, description: 'Clear waves 7 through Sol Heredit.', submitRequiresPrevious: true, items: [{ itemName: 'Colosseum completion proof' }] },
      ],
    },
    {
      row: 2, col: 1, categoryIndex: 2, name: 'Wintertodt',
      tasks: [{ label: 'Part A', points: 20, description: 'Complete a Wintertodt kill.', items: [{ itemName: 'Bruma torch' }] }],
    },
    {
      // Manual-scoring example: a one-off custom challenge with no item list
      // to codify. Mods judge the screenshot directly and decide completion
      // + points when reviewing each submission.
      row: 2, col: 2, categoryIndex: 2, name: 'Custom Challenge: GOTR Speedrun',
      tasks: [{
        label: 'Part A', points: 20, scoringMode: 'manual',
        description: 'Complete a Guardians of the Rift run in under 6 minutes. Submit a screenshot of the post-game reward screen showing the completion time — a mod will judge and award points manually.',
        items: [],
      }],
    },
  ];

  const tileRowsById: Record<string, { id: string }> = {};
  let cerberusTaskAId: string | null = null;

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
      const [task] = await db.insert(tileTasks).values({
        tileId: tile.id,
        label: taskDef.label,
        sortOrder: i,
        points: taskDef.points,
        description: taskDef.description,
        scoringMode: taskDef.scoringMode ?? 'automatic',
        submitRequiresPrevious: taskDef.submitRequiresPrevious ?? false,
        pointsRequirePrevious: taskDef.pointsRequirePrevious ?? false,
        requiresNoDuplicates: taskDef.requiresNoDuplicates ?? false,
        allowsPreviouslyAcquired: taskDef.allowsPreviouslyAcquired ?? false,
        allowsPreLoad: taskDef.allowsPreLoad ?? false,
        minSubmissions: taskDef.minSubmissions ?? 1,
        requiresCompleteSet: taskDef.requiresCompleteSet ?? false,
      }).returning();

      if (def.name === 'Cerberus' && taskDef.label === 'Part A') cerberusTaskAId = task.id;

      for (const [j, item] of taskDef.items.entries()) {
        await db.insert(tileTaskItems).values({
          taskId: task.id,
          itemName: item.itemName,
          quantity: item.quantity ?? 1,
          optionsGroup: item.optionsGroup ?? null,
          sortOrder: j,
        });
      }
    }
  }

  if (cerberusTaskAId) {
    await db.insert(tileWildcards).values({
      tileId: tileRowsById['0,2'].id,
      itemName: 'Cerberus jar',
      maxRedemptionsPerTeam: 1,
      description: 'Redeeming a Cerberus jar counts as a Cerberus drop.',
      applicableTaskId: cerberusTaskAId,
    });
  }

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

  console.log(`Seeded bingo "${bingo.name}" (slug: ${bingo.slug}) with ${tileDefs.length} tiles, 2 teams, 8 lines.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

// Where each Wise Old Man boss metric's drops come from on the OSRS Wiki (#195).
// One WOM kill of the metric is one roll of each of its sources, scaled by `weight`.
//
// `source` is the wiki's "Dropped from" value in its `dropsline` bucket, which
// names a variant after a "#" (Vorkath#Post-quest). `page` is the wiki page the
// rows live on; scripts/fetch-drop-rates.ts reads it. The raids have no usable
// per-kill rows, so their sources are written by hand in raidRates.ts instead.
//
// Adding a boss is one entry here, then `npm run drop-rates:refresh -w server`.
// Left out on purpose, as they're not part of a Bingo: lunar_chests, tempoross,
// wintertodt, zalcano.

export interface DropSource {
  source: string;
  page: string;
  /** Share of a kill that rolls this source (default 1). The Royal Titans give one Titan's loot per kill. */
  weight?: number;
}

function on(page: string, variant?: string): DropSource {
  return { source: variant ? `${page}#${variant}` : page, page };
}

const RAID = ""; // hand-written sources in raidRates.ts, not on a wiki page

const COLOSSEUM_WAVES: DropSource[] = Array.from({ length: 12 }, (_, i) => on("Rewards Chest (Fortis Colosseum)", `Wave ${i + 1}`));

export const BOSS_SOURCES = {
  abyssal_sire: [on("Abyssal Sire")],
  alchemical_hydra: [on("Alchemical Hydra")],
  amoxliatl: [on("Amoxliatl", "Post-quest")],
  araxxor: [on("Araxxor")],
  artio: [on("Artio")],
  barrows_chests: [on("Chest (Barrows)")],
  brutus: [on("Brutus")],
  bryophyta: [on("Bryophyta", "Members")],
  callisto: [on("Callisto")],
  calvarion: [on("Calvar'ion")],
  cerberus: [on("Cerberus")],
  chambers_of_xeric: [{ source: "Chambers of Xeric", page: RAID }],
  chambers_of_xeric_challenge_mode: [{ source: "Chambers of Xeric (Challenge Mode)", page: RAID }],
  chaos_elemental: [on("Chaos Elemental")],
  chaos_fanatic: [on("Chaos Fanatic")],
  commander_zilyana: [on("Commander Zilyana")],
  corporeal_beast: [on("Corporeal Beast")],
  crazy_archaeologist: [on("Crazy archaeologist")],
  dagannoth_prime: [on("Dagannoth Prime")],
  dagannoth_rex: [on("Dagannoth Rex")],
  dagannoth_supreme: [on("Dagannoth Supreme")],
  deranged_archaeologist: [on("Deranged archaeologist")],
  doom_of_mokhaiotl: [on("Doom of Mokhaiotl")],
  duke_sucellus: [on("Duke Sucellus")],
  general_graardor: [on("General Graardor")],
  giant_mole: [on("Giant Mole")],
  grotesque_guardians: [on("Grotesque Guardians")],
  hespori: [on("Hespori")],
  kalphite_queen: [on("Kalphite Queen")],
  king_black_dragon: [on("King Black Dragon")],
  kraken: [on("Kraken")],
  kreearra: [on("Kree'arra")],
  kril_tsutsaroth: [on("K'ril Tsutsaroth")],
  mad_angel: [on("Mad Angel")],
  maggot_king: [on("Maggot King")],
  // A Mimic is an elite or master casket's; WOM counts both as one metric.
  mimic: [
    { ...on("The Mimic", "Elite"), weight: 0.5 },
    { ...on("The Mimic", "Master"), weight: 0.5 },
  ],
  nex: [on("Nex")],
  nightmare: [on("The Nightmare")],
  phosanis_nightmare: [on("Phosani's Nightmare")],
  obor: [on("Obor", "Members")],
  phantom_muspah: [on("Phantom Muspah")],
  sarachnis: [on("Sarachnis")],
  scorpia: [on("Scorpia")],
  scurrius: [on("Scurrius", "MVP")],
  shellbane_gryphon: [{ source: "Shellbane gryphon", page: "Shellbane Gryphon" }],
  skotizo: [on("Skotizo")],
  // A full run: the chest keeps every wave's roll, so each wave is a source.
  sol_heredit: COLOSSEUM_WAVES,
  spindel: [on("Spindel")],
  the_gauntlet: [on("Reward Chest (The Gauntlet)", "Regular")],
  the_corrupted_gauntlet: [on("Reward Chest (The Gauntlet)", "Corrupted")],
  the_hueycoatl: [on("The Hueycoatl")],
  the_leviathan: [on("The Leviathan")],
  // The loot is one Titan's, picked after the fight.
  the_royal_titans: [
    { ...on("Branda the Fire Queen"), weight: 0.5 },
    { ...on("Eldric the Ice King"), weight: 0.5 },
  ],
  the_whisperer: [on("The Whisperer")],
  theatre_of_blood: [{ source: "Theatre of Blood", page: RAID }],
  theatre_of_blood_hard_mode: [{ source: "Theatre of Blood (Hard Mode)", page: RAID }],
  thermonuclear_smoke_devil: [on("Thermonuclear smoke devil")],
  tombs_of_amascut: [{ source: "Tombs of Amascut", page: RAID }],
  tombs_of_amascut_expert: [{ source: "Tombs of Amascut", page: RAID }],
  tzkal_zuk: [on("TzKal-Zuk")],
  tztok_jad: [on("TzTok-Jad")],
  vardorvis: [on("Vardorvis")],
  venenatis: [on("Venenatis")],
  vetion: [on("Vet'ion")],
  vorkath: [on("Vorkath", "Post-quest")],
  yama: [on("Yama")],
  zulrah: [on("Zulrah")],
} satisfies Record<string, DropSource[]>;

export type BossMetric = keyof typeof BOSS_SOURCES;

export const BOSS_METRICS = Object.keys(BOSS_SOURCES) as BossMetric[];

/** The wiki pages to read, one per page, raids excluded. */
export function wikiPages(): string[] {
  return [...new Set(Object.values(BOSS_SOURCES).flatMap((sources) => sources.map((s) => s.page)).filter((p) => p !== RAID))].sort();
}

// The Wise Old Man boss metrics the app knows, and what Wrapped and the Dry card call each one.

/**
 * What each Wise Old Man boss metric is called. Not the wiki page: raids have none, and Barrows' is "Chest (Barrows)".
 * The server's Luck tables (luck/bossSources) are checked against it, so every boss they know is named here.
 */
export const WOM_BOSS_NAMES = {
  abyssal_sire: "Abyssal Sire",
  alchemical_hydra: "Alchemical Hydra",
  amoxliatl: "Amoxliatl",
  araxxor: "Araxxor",
  artio: "Artio",
  barrows_chests: "Barrows",
  brutus: "Brutus",
  bryophyta: "Bryophyta",
  callisto: "Callisto",
  calvarion: "Calvar'ion",
  cerberus: "Cerberus",
  chambers_of_xeric: "Chambers of Xeric",
  chambers_of_xeric_challenge_mode: "Chambers of Xeric (CM)",
  chaos_elemental: "Chaos Elemental",
  chaos_fanatic: "Chaos Fanatic",
  commander_zilyana: "Commander Zilyana",
  corporeal_beast: "Corporeal Beast",
  crazy_archaeologist: "Crazy Archaeologist",
  dagannoth_prime: "Dagannoth Prime",
  dagannoth_rex: "Dagannoth Rex",
  dagannoth_supreme: "Dagannoth Supreme",
  deranged_archaeologist: "Deranged Archaeologist",
  doom_of_mokhaiotl: "Doom of Mokhaiotl",
  duke_sucellus: "Duke Sucellus",
  general_graardor: "General Graardor",
  giant_mole: "Giant Mole",
  grotesque_guardians: "Grotesque Guardians",
  hespori: "Hespori",
  kalphite_queen: "Kalphite Queen",
  king_black_dragon: "King Black Dragon",
  kraken: "Kraken",
  kreearra: "Kree'arra",
  kril_tsutsaroth: "K'ril Tsutsaroth",
  mad_angel: "Mad Angel",
  maggot_king: "Maggot King",
  mimic: "the Mimic",
  nex: "Nex",
  nightmare: "the Nightmare",
  phosanis_nightmare: "Phosani's Nightmare",
  obor: "Obor",
  phantom_muspah: "Phantom Muspah",
  sarachnis: "Sarachnis",
  scorpia: "Scorpia",
  scurrius: "Scurrius",
  shellbane_gryphon: "Shellbane Gryphon",
  skotizo: "Skotizo",
  sol_heredit: "the Colosseum",
  spindel: "Spindel",
  the_gauntlet: "the Gauntlet",
  the_corrupted_gauntlet: "the Corrupted Gauntlet",
  the_hueycoatl: "the Hueycoatl",
  the_leviathan: "the Leviathan",
  the_royal_titans: "the Royal Titans",
  the_whisperer: "the Whisperer",
  theatre_of_blood: "Theatre of Blood",
  theatre_of_blood_hard_mode: "Theatre of Blood (HM)",
  thermonuclear_smoke_devil: "Thermonuclear Smoke Devil",
  tombs_of_amascut: "Tombs of Amascut",
  tombs_of_amascut_expert: "Tombs of Amascut (Expert)",
  tzkal_zuk: "TzKal-Zuk",
  tztok_jad: "TzTok-Jad",
  vardorvis: "Vardorvis",
  venenatis: "Venenatis",
  vetion: "Vet'ion",
  vorkath: "Vorkath",
  yama: "Yama",
  zulrah: "Zulrah",
} as const satisfies Record<string, string>;

export type WomBossMetric = keyof typeof WOM_BOSS_NAMES;

/** Whether a string is a Wise Old Man boss metric the app knows. */
export function isWomBossMetric(value: unknown): value is WomBossMetric {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(WOM_BOSS_NAMES, value);
}

/**
 * The raids and bosses Wrapped's "Who killed it the most" part (CONTEXT.md "Wrapped") looks at, in order, until an Admin
 * changes a Bingo's list. Every mode its own entry.
 */
export const DEFAULT_WRAPPED_BOSSES: readonly string[] = [
  "chambers_of_xeric",
  "chambers_of_xeric_challenge_mode",
  "theatre_of_blood",
  "theatre_of_blood_hard_mode",
  "tombs_of_amascut",
  "tombs_of_amascut_expert",
  "nex",
  "doom_of_mokhaiotl",
  "sol_heredit",
  "phosanis_nightmare",
  "nightmare",
];

/** Most raids and bosses a Bingo's list can hold. */
export const MAX_WRAPPED_BOSSES = 30;

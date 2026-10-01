// What the board's URL opens (#389): the open Tile (?tile=), the viewed Team (?team=) and a dialog (?open=), so a link
// reopens the same view. Pure, so the arrival handling is testable; BingoPageProvider reads and writes the params.

export const TILE_PARAM = "tile";
export const TEAM_PARAM = "team";
export const OPEN_PARAM = "open";

/** The board's dialogs that stay in ?open= while they're open. */
export const BOARD_DIALOGS = ["rules", "team", "points", "submissions"] as const;
export type BoardDialog = (typeof BOARD_DIALOGS)[number];
/** The ☰ menu's Tutorial link: arrival-only, started (and dropped) by TutorialProvider. */
const ARRIVAL_ONLY = ["tutorial"];

export interface BoardUrlParams {
  tile: string | null;
  team: string | null;
  open: string | null;
}

export interface BoardUrlContext {
  /** The ids of the Tiles the viewer can open, or null while the board is still loading. */
  tileIds: ReadonlySet<string> | null;
  /** The viewer is sent the sealed board: no Tile opens. */
  sealed: boolean;
  /** Whether the shell and the viewer's permissions are in, so what's not allowed can be told from what's not known yet. */
  ready: boolean;
  teamIds: readonly string[];
  myTeamId: string | null;
  /** Whether the viewer may look at another Team's board. */
  canPickTeam: boolean;
  /** Whether the bingo has Rules to show (or says they come later). */
  hasRules: boolean;
}

export interface BoardUrlState {
  openTileId: string | null;
  /** The Team being viewed: the one in the URL when the viewer may pick it, otherwise their own. */
  viewingTeamId: string | null;
  dialog: BoardDialog | null;
  /** Params naming something the viewer can't see or that doesn't exist, to drop quietly. */
  drop: string[];
}

export function resolveBoardUrl(params: BoardUrlParams, ctx: BoardUrlContext): BoardUrlState {
  const drop: string[] = [];

  const teamAllowed = !!params.team && ctx.canPickTeam && ctx.teamIds.includes(params.team);
  const viewingTeamId = teamAllowed ? params.team : ctx.myTeamId;
  // Viewing their own Team leaves it out.
  if (params.team && ctx.ready && (!teamAllowed || params.team === ctx.myTeamId)) drop.push(TEAM_PARAM);

  const tileOpens = !!params.tile && !ctx.sealed && !!ctx.tileIds?.has(params.tile);
  if (params.tile && ctx.tileIds && !tileOpens) drop.push(TILE_PARAM);

  let dialog: BoardDialog | null = null;
  const open = params.open;
  if (open && (BOARD_DIALOGS as readonly string[]).includes(open)) {
    // Team overview, the points breakdown and the Submissions drawer are the viewed Team's.
    const opens = open === "rules" ? ctx.hasRules : !!viewingTeamId;
    if (opens) dialog = open as BoardDialog;
    else if (ctx.ready) drop.push(OPEN_PARAM);
  } else if (open && !ARRIVAL_ONLY.includes(open)) drop.push(OPEN_PARAM);

  return { openTileId: tileOpens ? params.tile : null, viewingTeamId, dialog, drop };
}

import { describe, expect, it } from "vitest";
import { resolveBoardUrl, type BoardUrlContext, type BoardUrlParams } from "./boardUrlState";

const ctx: BoardUrlContext = {
  tileIds: new Set(["t1", "t2"]),
  sealed: false,
  ready: true,
  teamIds: ["mine", "other"],
  myTeamId: "mine",
  canPickTeam: false,
  hasRules: true,
};
const params = (p: Partial<BoardUrlParams>): BoardUrlParams => ({ tile: null, team: null, open: null, ...p });

describe("resolveBoardUrl", () => {
  it("opens nothing and drops nothing on a bare URL, viewing the viewer's own Team", () => {
    expect(resolveBoardUrl(params({}), ctx)).toEqual({ openTileId: null, viewingTeamId: "mine", dialog: null, drop: [] });
  });

  it("opens a Tile on arrival", () => {
    expect(resolveBoardUrl(params({ tile: "t2" }), ctx)).toMatchObject({ openTileId: "t2", drop: [] });
  });

  it("drops a Tile that doesn't exist, quietly", () => {
    expect(resolveBoardUrl(params({ tile: "gone" }), ctx)).toMatchObject({ openTileId: null, drop: ["tile"] });
  });

  it("drops a Tile while the Tiles are sealed for the viewer", () => {
    expect(resolveBoardUrl(params({ tile: "t1" }), { ...ctx, sealed: true })).toMatchObject({ openTileId: null, drop: ["tile"] });
  });

  it("waits for the board before judging a Tile", () => {
    expect(resolveBoardUrl(params({ tile: "t1" }), { ...ctx, tileIds: null })).toMatchObject({ openTileId: null, drop: [] });
  });

  it("views another Team for a viewer who can pick one", () => {
    expect(resolveBoardUrl(params({ team: "other" }), { ...ctx, canPickTeam: true })).toMatchObject({ viewingTeamId: "other", drop: [] });
  });

  it("drops another Team for a viewer who may not view it, showing their own", () => {
    expect(resolveBoardUrl(params({ team: "other" }), ctx)).toMatchObject({ viewingTeamId: "mine", drop: ["team"] });
  });

  it("drops an unknown Team, and the viewer's own (it's the default)", () => {
    const picker = { ...ctx, canPickTeam: true };
    expect(resolveBoardUrl(params({ team: "nope" }), picker)).toMatchObject({ viewingTeamId: "mine", drop: ["team"] });
    expect(resolveBoardUrl(params({ team: "mine" }), picker)).toMatchObject({ viewingTeamId: "mine", drop: ["team"] });
  });

  it("doesn't drop a Team before the viewer's permissions are known", () => {
    expect(resolveBoardUrl(params({ team: "other" }), { ...ctx, ready: false })).toMatchObject({ viewingTeamId: "mine", drop: [] });
  });

  it("opens each board dialog from ?open=", () => {
    for (const open of ["rules", "team", "points", "submissions"]) expect(resolveBoardUrl(params({ open }), ctx)).toMatchObject({ dialog: open, drop: [] });
  });

  it("leaves ?open=tutorial for the Tutorial", () => {
    expect(resolveBoardUrl(params({ open: "tutorial" }), ctx)).toMatchObject({ dialog: null, drop: [] });
  });

  it("drops an unknown dialog, Rules a bingo doesn't have, and a Team's dialog with no Team to show", () => {
    expect(resolveBoardUrl(params({ open: "nope" }), ctx)).toMatchObject({ dialog: null, drop: ["open"] });
    expect(resolveBoardUrl(params({ open: "rules" }), { ...ctx, hasRules: false })).toMatchObject({ dialog: null, drop: ["open"] });
    expect(resolveBoardUrl(params({ open: "submissions" }), { ...ctx, myTeamId: null })).toMatchObject({ dialog: null, drop: ["open"] });
  });

  it("opens a Team's dialog for the Team in the URL", () => {
    const mod = { ...ctx, myTeamId: null, canPickTeam: true };
    expect(resolveBoardUrl(params({ team: "other", open: "team", tile: "t1" }), mod)).toEqual({ openTileId: "t1", viewingTeamId: "other", dialog: "team", drop: [] });
  });
});

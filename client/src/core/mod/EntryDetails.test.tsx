// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { AuditEntry, BoardDiff } from "@bingo/shared";
import { EntryDetails } from "./AuditLog";

afterEach(cleanup);

const diff: BoardDiff = {
  tiles: [
    {
      tileId: "t1",
      change: "changed",
      name: "Vorkath",
      fields: [],
      nodes: [{ nodeId: "n1", change: "changed", path: [], name: "Head", summary: null, fields: [{ field: "Points", before: "40", after: "65" }] }],
    },
  ],
  lines: [],
  categories: [],
  exclusivityRules: null,
  rulesMarkdown: { before: "Old rules", after: "New rules" },
};

function published(details: object): AuditEntry {
  return {
    id: 1,
    at: "2026-10-01T00:00:00.000Z",
    action: "board.published",
    category: "board",
    tone: "ok",
    visibility: "mods",
    actorType: "user",
    actorRole: "admin",
    actor: null,
    onBehalfOf: null,
    entity: { type: "bingo", id: "b1", label: "Live Bingo" },
    team: null,
    details,
    label: "someone published the board",
  } as unknown as AuditEntry;
}

const summary = { summary: ["1 Tile changed", "Rules text changed"], removedClaims: 0, teams: [{ teamId: "a", teamName: "Team A", before: 40, after: 60 }] };

describe("EntryDetails", () => {
  it("shows a Board published entry's diff as the Publish screen did, below its summary and Teams' points", () => {
    render(<EntryDetails entry={published({ ...summary, diff })} />);
    expect(screen.getByText("What changed")).toBeTruthy();
    expect(screen.getByText("Vorkath")).toBeTruthy();
    expect(screen.getByText("Head")).toBeTruthy();
    expect(screen.getByText("65")).toBeTruthy();
    expect(screen.getByText("Rules text changed", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Team A:", { exact: false })).toBeTruthy();
    // The diff isn't also dumped as raw JSON among the other details.
    expect(screen.queryByText(/"tileId"/)).toBeNull();
  });

  it("shows only the summary for an entry from before the diff was kept", () => {
    render(<EntryDetails entry={published(summary)} />);
    expect(screen.queryByText("What changed")).toBeNull();
    expect(screen.getByText("1 Tile changed")).toBeTruthy();
  });
});

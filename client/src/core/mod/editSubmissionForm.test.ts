import { describe, expect, it } from "vitest";
import type { GraphNode, ModSubmissionRow, Tile } from "@bingo/shared";
import { toLocalInput } from "../ui/timeRange";
import { claimOptions, editRequest, formProblem, initialEditForm, isEdited, proofTaskOptions, withClaimRemoved, withTile } from "./editSubmissionForm";

const SUBMITTED = "2026-10-01T12:34:56.000Z";
const UPDATED = "2026-10-02T08:00:00.000Z";

function node(id: string, kind: GraphNode["kind"], extra: Partial<GraphNode> = {}, children: GraphNode[] = []): GraphNode {
  return { id, kind, label: null, itemName: null, requiresProof: false, proofNote: null, children, ...extra } as GraphNode;
}

// Two Parts; the Onyx leaf is shared by both, and Part 2 has a manual Task.
const onyx = node("onyx", "ITEM", { itemName: "Onyx" });
const tile = {
  id: "t1",
  name: "Zulrah",
  requiresProof: false,
  proofNote: null,
  node: node("root", "ALL", {}, [
    node("p1", "ANY", { label: "Page 1" }, [node("scale", "ITEM", { itemName: "Zulrah's scales" }), onyx]),
    node("p2", "ALL", { label: "Page 2" }, [onyx, node("kc", "MANUAL", { label: "50 kc" })]),
  ]),
} as unknown as Tile;

function dropRow(extra: Partial<ModSubmissionRow["submission"]> = {}): ModSubmissionRow {
  return {
    submission: { id: "s1", kind: "drop", submittedByUserId: "u1", proofTileId: null, proofTaskId: null, status: "approved", reviewerNotes: "nice", submittedAt: SUBMITTED, updatedAt: UPDATED, ...extra },
    claims: [{ nodeId: "scale", quantity: 3 }],
    leaves: [{ id: "scale", kind: "ITEM", label: "Zulrah's scales", valuedAs: null }],
    tile: { id: "t1", name: "Zulrah" },
  } as unknown as ModSubmissionRow;
}

function proofRow(): ModSubmissionRow {
  return {
    ...dropRow({ kind: "proof", proofTileId: "t1", proofTaskId: "p2", status: "pending", reviewerNotes: null }),
    claims: [],
    leaves: [],
  };
}

describe("initialEditForm", () => {
  it("is the drop as it stands", () => {
    expect(initialEditForm(dropRow())).toEqual({
      submittedByUserId: "u1",
      kind: "drop",
      tileId: "t1",
      taskId: "",
      claims: [{ nodeId: "scale", quantity: "3" }],
      submittedAt: toLocalInput(SUBMITTED),
      status: "approved",
      reviewerNotes: "nice",
    });
  });

  it("gives a proof its Tile and Task, and an empty Item line should it become a drop", () => {
    expect(initialEditForm(proofRow())).toMatchObject({ kind: "proof", tileId: "t1", taskId: "p2", claims: [{ nodeId: "", quantity: "1" }], reviewerNotes: "" });
  });
});

describe("editRequest", () => {
  it("sends the form untouched as the row is, its exact submitted time included", () => {
    const row = dropRow();
    expect(editRequest(initialEditForm(row), row, false)).toEqual({
      expectedUpdatedAt: UPDATED,
      submittedByUserId: "u1",
      submittedAt: SUBMITTED,
      status: "approved",
      reviewerNotes: "nice",
      kind: "drop",
      claims: [{ nodeId: "scale", quantity: 3 }],
    });
  });

  it("sends a changed submitted time from the viewer's local time", () => {
    const row = dropRow();
    const form = { ...initialEditForm(row), submittedAt: "2026-09-30T10:00" };
    expect(editRequest(form, row, false).submittedAt).toBe(new Date("2026-09-30T10:00").toISOString());
  });

  it("clears the notes for pending, and sends empty notes as none", () => {
    const row = dropRow();
    expect(editRequest({ ...initialEditForm(row), status: "pending" }, row, false).reviewerNotes).toBeNull();
    expect(editRequest({ ...initialEditForm(row), reviewerNotes: "" }, row, false).reviewerNotes).toBeNull();
  });

  it("sends a proof's Tile and Task and no Claims, and force only when saving anyway", () => {
    const row = dropRow();
    const body = editRequest({ ...initialEditForm(row), kind: "proof", taskId: "" }, row, true);
    expect(body).toMatchObject({ kind: "proof", proofTileId: "t1", proofTaskId: null, force: true });
    expect(body).not.toHaveProperty("claims");
    expect(editRequest(initialEditForm(row), row, false)).not.toHaveProperty("force");
  });
});

describe("isEdited", () => {
  it("is false until something would change", () => {
    const row = dropRow();
    expect(isEdited(initialEditForm(row), row)).toBe(false);
    expect(isEdited({ ...initialEditForm(row), claims: [{ nodeId: "scale", quantity: "4" }] }, row)).toBe(true);
  });

  it("ignores a pending one's notes and a proof's unused Item lines", () => {
    const row = proofRow();
    expect(isEdited({ ...initialEditForm(row), reviewerNotes: "typed" }, row)).toBe(false);
    expect(isEdited({ ...initialEditForm(row), claims: [{ nodeId: "onyx", quantity: "1" }] }, row)).toBe(false);
  });
});

describe("formProblem", () => {
  const now = Date.parse("2026-10-12T00:00:00.000Z");
  const form = initialEditForm(dropRow());

  it("passes a complete form", () => {
    expect(formProblem(form, now)).toBeNull();
  });

  it("wants every Item line picked with a whole quantity of at least 1", () => {
    expect(formProblem({ ...form, claims: [{ nodeId: "", quantity: "1" }] }, now)).toMatch(/Item/);
    for (const quantity of ["0", "1.5", ""]) expect(formProblem({ ...form, claims: [{ nodeId: "scale", quantity }] }, now)).toMatch(/quantity/);
  });

  it("refuses a time in the future, and checks no Items for a proof", () => {
    expect(formProblem({ ...form, submittedAt: toLocalInput("2026-10-13T00:00:00.000Z") }, now)).toMatch(/future/);
    expect(formProblem({ ...form, kind: "proof", claims: [{ nodeId: "", quantity: "" }] }, now)).toBeNull();
  });
});

describe("withTile and withClaimRemoved", () => {
  it("clears the Claims and Task for another Tile, and keeps them for the same one", () => {
    const form = initialEditForm(proofRow());
    expect(withTile(form, "t2")).toMatchObject({ tileId: "t2", taskId: "", claims: [{ nodeId: "", quantity: "1" }] });
    expect(withTile(form, "t1")).toBe(form);
  });

  it("empties the last Item line rather than removing it", () => {
    expect(withClaimRemoved(initialEditForm(dropRow()), 0).claims).toEqual([{ nodeId: "", quantity: "1" }]);
  });
});

describe("claimOptions", () => {
  it("lists each leaf once under its first Part, a manual Task as Manual review, and disables those on another line", () => {
    expect(claimOptions(tile, dropRow(), new Set(["onyx"]))).toEqual([
      { value: "scale", label: "Zulrah's scales", group: "Page 1", selectedLabel: "Zulrah's scales · Page 1", disabled: false },
      { value: "onyx", label: "Onyx", group: "Page 1", selectedLabel: "Onyx · Page 1", disabled: true },
      { value: "kc", label: "Manual review", group: "Page 2", selectedLabel: "Manual review · Page 2", disabled: false },
    ]);
  });

  it("keeps a claimed leaf that's left the board on offer, on its own Tile only", () => {
    const row = { ...dropRow(), leaves: [{ id: "gone", kind: "ITEM", label: "Tanzanite fang", valuedAs: null }] } as ModSubmissionRow;
    expect(claimOptions(tile, row, new Set()).at(-1)).toMatchObject({ value: "gone", label: "Tanzanite fang", group: "No longer on the board" });
    expect(claimOptions({ ...tile, id: "t2" }, row, new Set()).some((o) => o.value === "gone")).toBe(false);
  });
});

describe("proofTaskOptions", () => {
  it("offers no Task for a Tile-wide requirement", () => {
    expect(proofTaskOptions({ ...tile, requiresProof: true })).toBeNull();
  });

  it("lists the Tasks needing one first, the rest marked", () => {
    const perTask = { ...tile, node: { ...tile.node, children: [tile.node.children[0], { ...tile.node.children[1], requiresProof: true }] } } as Tile;
    expect(proofTaskOptions(perTask)).toEqual([
      { value: "p2", label: "Page 2" },
      { value: "p1", label: "Page 1 (needs no Proof screenshot)" },
    ]);
  });

  it("offers None on a Tile that needs no Proof screenshot", () => {
    expect(proofTaskOptions(tile)?.[0]).toEqual({ value: "", label: "None" });
  });
});

import { describe, expect, it } from "vitest";
import { withParams } from "../ui/urlParams";
import { actorFilter, readAuditFilters, writeAuditFilters, type AuditFilters } from "./auditFilters";

const NONE: AuditFilters = { categories: new Set(), teams: new Set(), actors: new Set(), range: {}, q: "" };

describe("audit log filters in the URL", () => {
  it("keeps the URL clean while nothing is filtered", () => {
    const params = withParams(new URLSearchParams("tab=audit"), writeAuditFilters(NONE));
    expect(params.toString()).toBe("tab=audit");
    expect(readAuditFilters(params)).toEqual(NONE);
  });

  it("round-trips every filter through the URL", () => {
    const filters: AuditFilters = {
      categories: new Set(["board", "team"]),
      teams: new Set(["t1"]),
      actors: new Set(["u1", "u2"]),
      range: { since: "2026-09-01T00:00:00.000Z", until: "2026-09-02T00:00:00.000Z" },
      q: "drop",
    };
    const params = withParams(new URLSearchParams(), writeAuditFilters(filters));
    expect(params.get("category")).toBe("board,team");
    expect(params.get("actors")).toBe("u1,u2");
    expect(readAuditFilters(new URLSearchParams(params.toString()))).toEqual(filters);
  });

  it("drops a cleared filter and trims the search", () => {
    const params = withParams(new URLSearchParams("category=board&q=x"), writeAuditFilters({ ...NONE, q: "  " }));
    expect(params.toString()).toBe("");
    expect(writeAuditFilters({ ...NONE, q: " drop " }).q).toBe("drop");
  });
});

describe("actorFilter", () => {
  it("filters by a link's picks before their entries have been seen", () => {
    const f = actorFilter(new Set(["u9"]), []);
    expect(f).toMatchObject({ query: ["u9"], narrowed: true, checked: [] });
  });

  it("is Any with nothing picked, and picking every option stores nothing", () => {
    expect(actorFilter(new Set(), ["u1"]).query).toBeUndefined();
    const f = actorFilter(new Set(["u1"]), ["u1", "u2"]);
    expect(f.checked).toEqual(["u1"]);
    expect([...f.pick(["u1", "u2"])]).toEqual([]);
    expect([...f.pick(["u2"])]).toEqual(["u2"]);
  });
});

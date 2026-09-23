import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createTestDb } from "../testUtils/testDb";
import { syncSignupRsn } from "./rsnSyncService";
import { TectonicClient, TectonicUnavailableError } from "./tectonicService";

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});
afterEach(() => {
  sqlite.close();
});

function seedSignup(womId: string | null, rsn = "Old Name") {
  const [admin] = db.insert(schema.users).values({ discordId: "admin", discordUsername: "admin" }).returning().all();
  const bingo = db.insert(schema.bingos).values({ slug: "test", name: "Test", boardRows: 3, boardCols: 3, createdByUserId: admin!.id }).returning().get();
  const [player] = db.insert(schema.users).values({ discordId: "player", discordUsername: "player" }).returning().all();
  const signup = db.insert(schema.signups).values({ bingoId: bingo.id, userId: player!.id, rsn, womId, rsnVerified: womId !== null }).returning().get();
  return { bingo, player: player!, signup };
}

/** A tectonic client whose WOM-id lookup answers `rsn` (or throws `err`). */
function fakeClient(answer: { rsn?: string | null; err?: Error }) {
  const client = Object.create(TectonicClient.prototype) as TectonicClient;
  const getRsnByWomId = vi.fn(async () => {
    if (answer.err) throw answer.err;
    return answer.rsn ?? null;
  });
  Object.assign(client, { getRsnByWomId });
  return { client, getRsnByWomId };
}

const rsnOf = (id: string) => db.select({ rsn: schema.signups.rsn }).from(schema.signups).where(eq(schema.signups.id, id)).get()!.rsn;
const nameChanges = () => db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "signup.name_changed")).all();

describe("syncSignupRsn", () => {
  it("saves the new name and records the name change when the account was renamed", async () => {
    const { signup, player } = seedSignup("12345");
    const { client, getRsnByWomId } = fakeClient({ rsn: "New Name" });

    const result = await syncSignupRsn(db, signup.id, client);

    expect(getRsnByWomId).toHaveBeenCalledWith("12345");
    expect(result).toEqual({ rsn: "New Name", renamedFrom: "Old Name" });
    expect(rsnOf(signup.id)).toBe("New Name");
    const [entry] = nameChanges();
    expect(entry).toBeDefined();
    expect(JSON.parse(entry!.details)).toEqual({ before: "Old Name", after: "New Name", womId: "12345" });
    expect(entry!.onBehalfOfUserId).toBe(player.id);
  });

  it("does nothing when the name is the same", async () => {
    const { signup } = seedSignup("12345");
    const result = await syncSignupRsn(db, signup.id, fakeClient({ rsn: "Old Name" }).client);
    expect(result).toEqual({ rsn: "Old Name", renamedFrom: null });
    expect(nameChanges()).toHaveLength(0);
  });

  it("doesn't ask tectonic without a WOM id, or without the integration", async () => {
    const { signup } = seedSignup(null);
    const { client, getRsnByWomId } = fakeClient({ rsn: "New Name" });
    expect(await syncSignupRsn(db, signup.id, client)).toEqual({ rsn: "Old Name", renamedFrom: null });
    expect(getRsnByWomId).not.toHaveBeenCalled();

    const other = seedSignupElsewhere("999");
    expect(await syncSignupRsn(db, other, null)).toEqual({ rsn: "Other", renamedFrom: null });
  });

  it("keeps the name when tectonic doesn't know the WOM id", async () => {
    const { signup } = seedSignup("12345");
    expect(await syncSignupRsn(db, signup.id, fakeClient({ rsn: null }).client)).toEqual({ rsn: "Old Name", renamedFrom: null });
    expect(rsnOf(signup.id)).toBe("Old Name");
  });

  it("keeps the name (and doesn't throw) when tectonic is down", async () => {
    const { signup } = seedSignup("12345");
    const down = fakeClient({ err: new TectonicUnavailableError("GET /users/wom/12345: HTTP 503") }).client;
    expect(await syncSignupRsn(db, signup.id, down)).toEqual({ rsn: "Old Name", renamedFrom: null });
    expect(nameChanges()).toHaveLength(0);
  });
});

/** A second signup (another bingo, another player) for the no-integration case. */
function seedSignupElsewhere(womId: string): string {
  const [owner] = db.insert(schema.users).values({ discordId: "owner2", discordUsername: "owner2" }).returning().all();
  const bingo = db.insert(schema.bingos).values({ slug: "other", name: "Other", boardRows: 3, boardCols: 3, createdByUserId: owner!.id }).returning().get();
  return db.insert(schema.signups).values({ bingoId: bingo.id, userId: owner!.id, rsn: "Other", womId }).returning().get().id;
}

describe("TectonicClient.getRsnByWomId", () => {
  it("asks for the users by WOM id and picks the RSN with that id", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify([{ user_id: "d1", rsns: [{ rsn: "Alt", wom_id: "1" }, { rsn: "New Name", wom_id: "12345" }] }]), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = new TectonicClient({ baseUrl: "http://tectonic.test", apiKey: "k", guildId: "g1" }, fetchImpl);
    expect(await client.getRsnByWomId("12345")).toBe("New Name");
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toBe("http://tectonic.test/api/v1/guilds/g1/users/wom/12345");
  });

  it("answers null for an unknown id (the API returns null or an empty list)", async () => {
    for (const body of [null, []]) {
      const client = new TectonicClient({ baseUrl: "http://t", apiKey: "k", guildId: "g" }, (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch);
      expect(await client.getRsnByWomId("777")).toBeNull();
    }
  });
});

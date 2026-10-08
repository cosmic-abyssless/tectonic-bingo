// What follows a Bingo's stage change, however it was made: an Admin's (routes/mod.ts) or the Bingo going Live by
// itself at its start date (bingoStartService.ts). All of it fire-and-forget: a Wise Old Man or Discord outage must
// never block or undo the stage change itself.

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema";
import type { Stage } from "@bingo/shared";
import { broadcastChange } from "../broadcastChange";
import { syncWomCompetition, syncWomCompetitionAfterDraft } from "./womCompetitionService";
import { syncDiscordTeams } from "./discordTeamService";
import { getWomReadQueue, queueBingoReads } from "./womReadService";
import { archiveBingoCompetition } from "./pastWomCompetitionService";
import * as wrappedService from "./wrappedService";

type Db = BetterSQLite3Database<typeof schema>;
type Bingo = typeof schema.bingos.$inferSelect;

/** `actorUserId` is the Admin who made the change, or null for the system (it publishes nothing on their behalf). */
export function afterStageChange(db: Db, bingo: Bingo, fromStage: Stage, toStage: Stage, actorUserId: string | null): void {
  broadcastChange({ type: "stage_changed", bingoId: bingo.id, payload: { stage: bingo.stage } });
  // syncWomCompetitionAfterDraft no-ops when the integration isn't configured.
  if (fromStage === "draft") void syncWomCompetitionAfterDraft(db, bingo.id);
  // The competition starts with the Bingo: from its start date, or (with none set) from now.
  if (toStage === "live") void syncWomCompetition(db, bingo.id);
  // Discord roles and channels are made as the draft finishes, alongside the WOM competition; later stage changes
  // (back to the Draft too, which undoes Teams) keep them in step.
  void syncDiscordTeams(db, bingo.id);
  // Snapshot the bingo's WOM competition once it's actually over, so its per-player gains survive independently of
  // WOM's own record. No-ops when the bingo has no linked competition.
  if (toStage === "complete") void archiveBingoCompetition(db, bingo.id);
  // Wise Old Man snapshots for Titles: a first read (with the baseline) as it goes live, and the final one as it ends.
  if (toStage === "live" || toStage === "complete") queueBingoReads(db, getWomReadQueue(db), bingo.id);
  // "Publish Wrapped when the Bingo finishes" (CONTEXT.md "Wrapped"); late Wise Old Man reads (queued above) need a
  // Re-publish.
  if (toStage === "complete" && actorUserId && wrappedService.publishWhenReady(db, bingo, actorUserId)) {
    broadcastChange({ type: "wrapped_published", bingoId: bingo.id, payload: {} });
  }
}

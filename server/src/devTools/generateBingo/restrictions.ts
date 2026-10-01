// Restrictions (CONTEXT.md "Restriction") during the captains stage, through the real endpoints: a Moderator takes
// rating picks from a Captain, the Admin takes submitting (a wildcard) from a Player and lifts it again that day, and a
// Moderator takes reacting from another Player for good. A Moderator also tries to restrict another Moderator, which
// the server has to refuse.
import { ApiError } from "./client";
import type { Player } from "./people";
import { runInOrder, type Ctx, type TeamSeed, type Timed } from "./setup";
import { HOUR, MINUTE } from "./timeline";

const path = (ctx: Ctx, rest: string) => `/api/bingos/${ctx.slug}${rest}`;
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);

export interface RestrictionsResult {
  applied: number;
  lifted: number;
  /** Sanity checks that failed: the server let something through it should have refused. */
  problems: string[];
}

export async function runRestrictions(ctx: Ctx, players: Player[], mods: Player[], seeds: TeamSeed[]): Promise<RestrictionsResult> {
  const { api, tl } = ctx;
  const rng = ctx.rng.fork("restrictions");
  const result: RestrictionsResult = { applied: 0, lifted: 0, problems: [] };
  const leads = new Set(seeds.flatMap((s) => [s.captain.index, ...(s.coCaptain ? [s.coCaptain.index] : [])]));
  const plain = rng.shuffle(players.filter((p) => p.userId && p.signupAt && !p.isMod && !p.isMe && !leads.has(p.index)));
  // Not a Captain who moderates too: a Moderator can't restrict them.
  const captains = seeds.map((s) => s.captain).filter((p) => p.userId && !p.isMe && !p.isMod);
  const mod = mods.find((m) => m.userId && m.signupAt);
  // With no Moderator to act (they need a signup to have been made one), the Admin applies them all.
  const modActor = mod?.discordId ?? ctx.admin;

  const restrict = async (actor: string, target: Player, action: string, reason: string, at: Date): Promise<string> => {
    const { restriction } = await api.as(actor).post<{ restriction: { id: string } }>(path(ctx, "/mod/restrictions"), { userId: target.userId, action, reason }, { at });
    result.applied++;
    return restriction.id;
  };
  const applyAt = (at: Date, actor: string, target: Player, action: string, reason: string): Timed => ({
    at,
    run: async () => {
      await restrict(actor, target, action, reason, at);
    },
  });

  const events: Timed[] = [];
  const captain = captains.length > 0 ? rng.pick(captains) : null;
  if (captain) {
    const at = plus(tl.captainsAt, rng.int(5 * 60, 7 * 60) * MINUTE);
    events.push(applyAt(at, modActor, captain, "rate_picks", "Shared the Team's scouting notes in the public channel"));
  }
  const [submitter, reactor] = plain;
  if (submitter) {
    // Lifted the same day, once the Player has sorted it out with the mods.
    const at = plus(tl.captainsAt, rng.int(8 * 60, 10 * 60) * MINUTE);
    const liftAt = plus(at, rng.int(6, 10) * HOUR);
    let id: string | null = null;
    events.push({
      at,
      run: async () => {
        id = await restrict(ctx.admin, submitter, "submit*", "Your RSN doesn't match the account on your signup: talk to a mod", at);
      },
    });
    events.push({
      at: liftAt,
      run: async () => {
        if (!id) return;
        await api.as(ctx.admin).delete(path(ctx, `/mod/restrictions/${id}`), { at: liftAt });
        result.lifted++;
      },
    });
  }
  if (reactor) {
    const at = plus(tl.captainsAt, rng.int(11 * 60, 13 * 60) * MINUTE);
    events.push(applyAt(at, modActor, reactor, "react", "Spamming reactions on every Submission"));
  }
  // Moderators restrict only Captains and Players: one trying it on another Moderator is refused.
  const [first, second] = mods.filter((m) => m.userId && m.signupAt);
  if (first && second) {
    const at = plus(tl.captainsAt, rng.int(14 * 60, 15 * 60) * MINUTE);
    events.push({
      at,
      run: async () => {
        try {
          await restrict(first.discordId, second, "submit_for_any_team", "Testing", at);
          result.problems.push("a Moderator restricted another Moderator");
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 403)) throw err;
        }
      },
    });
  }
  await runInOrder(events, ctx.limit);
  return result;
}

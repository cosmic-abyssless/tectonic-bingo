// A Borrowed account (CONTEXT.md "Borrowed account") through the real endpoint: late in the captains stage the Admin
// puts one Player's Signup on an OSRS account they don't own, with a reason, so every generated Bingo from the
// captains stage on has one. A test data Bingo never asks Wise Old Man, so the account needn't exist.
import { outsiderName, type Player } from "./people";
import { runInOrder, type Ctx, type TeamSeed } from "./setup";
import { MINUTE } from "./timeline";

const path = (ctx: Ctx, rest: string) => `/api/bingos/${ctx.slug}${rest}`;

export interface BorrowedAccountResult {
  /** The Player put on a borrowed account, and the account's name; null when the run ended before it happened. */
  player: Player | null;
  rsn: string | null;
}

export async function runBorrowedAccount(ctx: Ctx, players: Player[], seeds: TeamSeed[]): Promise<BorrowedAccountResult> {
  const rng = ctx.rng.fork("borrowed-account");
  const leads = new Set(seeds.flatMap((s) => [s.captain.index, ...(s.coCaptain ? [s.coCaptain.index] : [])]));
  const candidates = players.filter((p) => p.userId && p.signupAt && !p.isMod && !p.isMe && !leads.has(p.index));
  const result: BorrowedAccountResult = { player: null, rsn: null };
  if (candidates.length === 0) return result;
  const player = rng.pick(candidates);
  const rsn = outsiderName(rng, players);
  // After the Restrictions (runRestrictions), within the stage's first day, when a captains-stage run stops.
  const at = new Date(ctx.tl.captainsAt.getTime() + rng.int(16 * 60, 18 * 60) * MINUTE);
  await runInOrder(
    [
      {
        at,
        run: async () => {
          const { signups } = await ctx.api.as(ctx.admin).get<{ signups: { signup: { id: string }; user: { id: string } }[] }>(path(ctx, "/mod/signups"), { at });
          const signup = signups.find((s) => s.user.id === player.userId)!.signup;
          await ctx.api.as(ctx.admin).put(path(ctx, `/admin/signups/${signup.id}/account`), { rsn, reason: "Their own account is locked for the week, so they play on a friend's" }, { at });
          result.player = player;
          result.rsn = rsn;
        },
      },
    ],
    ctx.limit,
  );
  return result;
}

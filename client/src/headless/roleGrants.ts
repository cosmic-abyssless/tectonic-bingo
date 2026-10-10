// What every role holds in a Bingo, for the mod panel's Settings tab: GRANTS (@bingo/shared permissions.ts) read out
// role by role, each Action with the stages it's open in once the rules for everyone have had their say. No React.
import { ACTION_INFO, ACTIONS, grantsOf, RESTRICTABLE_ACTIONS, STAGE_LABEL, STAGE_ORDER, passesRules, type Action, type PermissionBingo, type Role, type Stage } from "@bingo/shared";

export interface RoleGrant {
  action: Action;
  /** The stages it's open in, in STAGE_ORDER: the role's grant, less the ones a rule for everyone (or ACTION_INFO's `onlyIn`) closes. */
  stages: Stage[];
  /** Not held by someone who also holds one of these roles (Grant.unlessAlso). */
  unlessAlso: readonly Role[];
  /** Something they do rather than see. Only these can be restricted, and not all of them (see `restrictable`). */
  does: boolean;
  /** A Restriction can take it from one user (RESTRICTABLE_ACTIONS). Never for an Admin, who can't be restricted. */
  restrictable: boolean;
}

/**
 * The Actions `role` holds, in ACTIONS order, with the stages each is open in for a Bingo with these settings. Admin
 * holds every one but the Owner's. A grant the rules leave closed in every stage isn't listed: nobody could ever use it.
 */
export function roleGrants(role: Role, settings: Pick<PermissionBingo, "showScreenshotsWhenFinished">): RoleGrant[] {
  return grantsOf(role)
    .map(({ action, stages, unlessAlso }) => ({
      action,
      unlessAlso: unlessAlso ?? [],
      stages: STAGE_ORDER.filter(
        (stage) => (!stages || stages.includes(stage)) && (ACTION_INFO[action].onlyIn?.includes(stage) ?? true) && passesRules({ ...settings, stage }, action),
      ),
      does: !action.startsWith("view_"),
      restrictable: role !== "admin" && role !== "owner" && (RESTRICTABLE_ACTIONS as readonly Action[]).includes(action),
    }))
    .filter((grant) => grant.stages.length > 0)
    .sort((a, b) => ACTIONS.indexOf(a.action) - ACTIONS.indexOf(b.action));
}

/** Stages in words: "Every stage", "Board revealed only", "Signups open to Board revealed", or a list if they skip any. */
export function describeStages(stages: readonly Stage[]): string {
  if (stages.length === STAGE_ORDER.length) return "Every stage";
  if (stages.length === 1) return `${STAGE_LABEL[stages[0]!]} only`;
  const first = STAGE_ORDER.indexOf(stages[0]!);
  const unbroken = stages.every((stage, i) => STAGE_ORDER.indexOf(stage) === first + i);
  if (unbroken) {
    const last = stages[stages.length - 1]!;
    return last === "complete" ? `From ${STAGE_LABEL[stages[0]!]} on` : `${STAGE_LABEL[stages[0]!]} to ${STAGE_LABEL[last]}`;
  }
  return stages.map((stage) => STAGE_LABEL[stage]).join(", ");
}

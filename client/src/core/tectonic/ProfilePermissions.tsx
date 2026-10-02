import type { PlayerAccess, Role } from "@bingo/shared";
import { useApplyRestriction, useLiftRestriction } from "../../api/queries";
import { Badge, Notice } from "../ui/Card";
import { RestrictionsManager } from "../mod/Restrictions";
import { ROLE_LABEL } from "../admin/roles";

/** What each role means for the person holding it, in this bingo. */
const ROLE_MEANS: Record<Role, string> = {
  owner: "Site-wide: manages who the site admins are. Can't be revoked.",
  admin: "Site-wide: can do anything in every bingo. Can't be restricted.",
  moderator: "Moderates this bingo: reviews Submissions, sees every Team and the audit log.",
  staff: "Collects this bingo's Buy-ins, and sees nothing else of it.",
  captain: "Leads a Team.",
  player: "Competes in this bingo.",
};

/** Why the viewer can't restrict this user, when they can't (restrictionService's rules, CONTEXT.md "Restriction"). */
function whyNotRestrictable(access: PlayerAccess): string {
  if (access.roles.includes("admin")) return "Admins can't be restricted.";
  if (access.roles.length === 0) return "They aren't part of this bingo, so there's nothing to restrict.";
  return "Moderators can only restrict Captains and Players.";
}

/**
 * The player card's Permissions tab, for the bingo's Moderators and Admins: the roles the player holds here, their
 * Restrictions, and Restrict and Lift where the viewer may (PlayerAccess).
 */
export function ProfilePermissions({ slug, userId, name, access }: { slug: string; userId: string; name: string; access: PlayerAccess }) {
  const applyRestriction = useApplyRestriction(slug);
  const liftRestriction = useLiftRestriction(slug);
  const error = applyRestriction.error ?? liftRestriction.error;
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">Roles</h3>
        {access.roles.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {access.roles.map((role) => (
              <li key={role} className="flex items-baseline gap-2">
                <Badge tone={role === "owner" || role === "admin" ? "info" : "neutral"}>{ROLE_LABEL[role]}</Badge>
                <span className="text-on-surface-muted">{ROLE_MEANS[role]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-on-surface-subtle">No role in this bingo.</p>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">Restrictions</h3>
        {access.restrictions.length === 0 && <p className="mb-3 text-sm text-on-surface-subtle">No restrictions.</p>}
        {error && (
          <div className="mb-3">
            <Notice tone="danger">{error.message}</Notice>
          </div>
        )}
        <RestrictionsManager
          name={name}
          restrictions={access.restrictions}
          restrictable={access.restrictable}
          liftable={access.liftable}
          onLift={(id) => {
            applyRestriction.reset();
            liftRestriction.mutate(id);
          }}
          onRestrict={(action, reason) => {
            liftRestriction.reset();
            applyRestriction.mutate({ userId, action, reason });
          }}
        />
        {!access.restrictable && <p className={`${access.restrictions.length > 0 ? "mt-3 " : ""}text-sm text-on-surface-subtle`}>{whyNotRestrictable(access)}</p>}
      </section>
    </div>
  );
}

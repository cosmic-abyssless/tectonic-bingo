import type { ReactNode } from "react";
import { ACTION_INFO, ACTIONS, RESTRICTABLE_ACTIONS, STAGE_LABEL, STAGE_ORDER, type Action, type Bingo, type Role, type Stage } from "@bingo/shared";
import { describeStages, roleGrants } from "../../headless/roleGrants";
import { CheckIcon, XIcon } from "../ui/icons";
import { Tooltip } from "../ui/Tooltip";
import { ModsManager, StaffManager } from "./ModsManager";
import { ROLE_LABEL } from "./roles";

// The matrix's columns, widest reach first, each with who holds it for its heading's tooltip.
const ROLES: { role: Role; label: string; summary: string }[] = [
  {
    role: "owner",
    label: ROLE_LABEL.owner,
    summary: "Site-wide: the site admins listed in ADMIN_DISCORD_IDS. An Owner is an Admin too, and alone manages site admins. Owners can't be revoked.",
  },
  {
    role: "admin",
    label: ROLE_LABEL.admin,
    summary: "Site-wide: every Action but the Owner's, in every stage the rules for everyone leave it open. Admins can't be restricted.",
  },
  { role: "moderator", label: ROLE_LABEL.moderator, summary: "Trusted clan members who moderate this Bingo. Admins add them above." },
  { role: "staff", label: ROLE_LABEL.staff, summary: "Clan leadership who collect the Buy-ins, and see nothing else of the Bingo. Admins add them above." },
  { role: "captain", label: ROLE_LABEL.captain, summary: "Leads a Team. Assigned in the Captains tab. A Captain is always a Player too, so they also hold the Player column." },
  {
    role: "player",
    label: ROLE_LABEL.player,
    summary: "Everyone with an active signup until Board revealed (less Cut signups once the Draft begins), then everyone on a Team.",
  },
];

/**
 * The mod panel's Permissions tab: the Bingo's Moderators and Staff, who Admins grant here, then every role's Actions as
 * one matrix (GRANTS, through roleGrants): a row per Action, a column per role, and in each cell the stages that role
 * holds it in.
 */
export function PermissionsPanel({ slug, bingo }: { slug: string; bingo: Bingo }) {
  // Per role, the stages it holds each Action in; an Action missing from a role's map isn't granted to it.
  const held = new Map(ROLES.map(({ role }) => [role, new Map(roleGrants(role, bingo).map((g) => [g.action, g.stages]))]));
  const groups: { label: string; actions: Action[] }[] = [
    { label: "Can do", actions: ACTIONS.filter((a) => !a.startsWith("view_")) },
    { label: "Can see", actions: ACTIONS.filter((a) => a.startsWith("view_")) },
  ];
  return (
    <div className="space-y-8">
      {/* Staff next to the Moderators: both granted per Bingo, Staff only for the Buy-ins (CONTEXT.md "Staff"). */}
      <div className="grid gap-8 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-on-surface">Moderators</h2>
          <ModsManager slug={slug} />
        </section>
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-on-surface">Staff</h2>
          <StaffManager slug={slug} />
        </section>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-on-surface">What each role can do</h2>
          <p className="mt-1 text-sm text-on-surface-muted">
            Each bar has a segment per stage, {STAGE_LABEL[STAGE_ORDER[0]!]} to {STAGE_LABEL[STAGE_ORDER[STAGE_ORDER.length - 1]!]}. Hover a bar for its stages, or
            a role for who holds it.
          </p>
        </div>
        <ul aria-label="Legend" className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-on-surface-muted">
          <LegendItem swatch={<Dot className="bg-ok" />}>Open now ({STAGE_LABEL[bingo.stage]})</LegendItem>
          <LegendItem swatch={<Dot className="bg-on-surface-muted" />}>Held in that stage</LegendItem>
          <LegendItem swatch={<Dot className="bg-outline" />}>Not held in that stage</LegendItem>
          <LegendItem swatch={<span className="w-2.5 text-center text-on-surface-subtle">—</span>}>Never held</LegendItem>
        </ul>
        <div className="overflow-x-auto rounded-lg border border-outline bg-surface">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-outline text-left text-xs text-on-surface-muted">
                <th className="px-4 py-2.5 font-medium">Action</th>
                {ROLES.map((r) => (
                  <th key={r.role} className="px-2 py-2.5 font-medium">
                    <Tooltip content={r.summary}>
                      <span className="cursor-help underline decoration-dotted underline-offset-4">{r.label}</span>
                    </Tooltip>
                  </th>
                ))}
                <th className="px-4 py-2.5 font-medium">
                  <Tooltip content="A Moderator or Admin can take it from one user, with a reason (a Restriction). Admins can't be restricted.">
                    <span className="cursor-help underline decoration-dotted underline-offset-4">Restrictable</span>
                  </Tooltip>
                </th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.label}>
                <tr className="border-b border-outline bg-surface-hover">
                  <th colSpan={ROLES.length + 2} className="px-4 py-1.5 text-left text-[11px] font-medium uppercase tracking-widest text-on-surface-subtle">
                    {group.label}
                  </th>
                </tr>
                {group.actions.map((action) => (
                  <tr key={action} className="border-b border-outline last:border-b-0">
                    <td className="max-w-[22rem] px-4 py-2">
                      <p className="font-medium text-on-surface">{ACTION_INFO[action].label}</p>
                      {ACTION_INFO[action].description && <p className="text-xs text-on-surface-muted">{ACTION_INFO[action].description}</p>}
                    </td>
                    {ROLES.map((r) => (
                      <td key={r.role} className="px-2 py-2">
                        <StageWindow stages={held.get(r.role)!.get(action)} current={bingo.stage} />
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      {(RESTRICTABLE_ACTIONS as readonly Action[]).includes(action) ? (
                        <CheckIcon size={16} className="text-ok" role="img" aria-hidden={false} aria-label="Restrictable" />
                      ) : (
                        <XIcon size={16} className="text-on-surface-subtle" role="img" aria-hidden={false} aria-label="Not restrictable" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>
    </div>
  );
}

function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {swatch}
      {children}
    </li>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`size-2.5 shrink-0 rounded-full ${className}`} />;
}

/** One role's hold on one Action: a segment per stage, filled where it's held, or a dash where it isn't granted at all. */
function StageWindow({ stages, current }: { stages: Stage[] | undefined; current: Stage }) {
  if (!stages) return <span className="text-on-surface-subtle">—</span>;
  const text = describeStages(stages);
  return (
    <Tooltip content={text}>
      <span role="img" aria-label={text} className="flex w-fit gap-0.5 py-1">
        {STAGE_ORDER.map((stage) => (
          <span
            key={stage}
            className={`h-2.5 w-2 rounded-[2px] ${stages.includes(stage) ? (stage === current ? "bg-ok" : "bg-on-surface-muted") : "bg-outline"}`}
          />
        ))}
      </span>
    </Tooltip>
  );
}

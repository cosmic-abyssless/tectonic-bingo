import { useState } from "react";
import { describeRestrictionTarget, RESTRICTABLE_ACTIONS, type RestrictionEntry } from "@bingo/shared";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { timeAgo } from "../ui/time";

// Restrictions (CONTEXT.md "Restriction"): what can be taken, a wildcard for both kinds of submitting, or everything.
export const RESTRICTION_OPTIONS: { value: string; label: string }[] = [...RESTRICTABLE_ACTIONS, "submit*", "*"].map((value) => {
  const words = describeRestrictionTarget(value);
  return { value, label: words.charAt(0).toUpperCase() + words.slice(1) };
});

export const restrictionLabel = (action: string) => RESTRICTION_OPTIONS.find((o) => o.value === action)?.label ?? action;

/**
 * One user's Restrictions, each with Lift when the viewer may lift it, and (when the viewer may restrict them) a form to
 * take one more Action, with a reason. Used by the mod roster's Restrictions cell and the player card's Permissions tab.
 */
export function RestrictionsManager({
  name,
  restrictions,
  restrictable,
  liftable,
  onLift,
  onRestrict,
  onCancel,
  autoFocus = false,
}: {
  name: string;
  restrictions: readonly RestrictionEntry[];
  restrictable: boolean;
  liftable: boolean;
  onLift: (restrictionId: string) => void;
  onRestrict: (action: string, reason: string) => void;
  /** Shows a Cancel button beside Restrict (the roster's popup editor). */
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [action, setAction] = useState(RESTRICTION_OPTIONS[0]!.value);
  const [reason, setReason] = useState("");
  const restrict = () => {
    if (!reason.trim()) return;
    onRestrict(action, reason.trim());
    setReason("");
  };
  return (
    <div className="space-y-3 text-sm">
      {restrictions.map((r) => (
        <div key={r.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-on-surface">{restrictionLabel(r.action)}</p>
            <p className="text-on-surface-muted">{r.reason}</p>
            <p className="text-xs text-on-surface-subtle">
              {r.appliedByLabel ?? "Someone"}, {timeAgo(r.appliedAt)}
            </p>
          </div>
          {liftable && (
            <Button size="sm" variant="ghost" onPress={() => onLift(r.id)}>
              Lift
            </Button>
          )}
        </div>
      ))}
      {restrictable && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            restrict();
          }}
        >
          <p className="text-on-surface">
            Take an Action from <span className="font-semibold">{name}</span> in this bingo, until it's lifted. They see the reason.
          </p>
          <select
            aria-label="What to restrict"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full rounded-md border border-outline bg-surface px-2 py-1.5 text-on-surface"
          >
            {RESTRICTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Input
            size="sm"
            aria-label="Reason"
            placeholder="Reason (they see this)"
            value={reason}
            maxLength={500}
            autoFocus={autoFocus}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button size="sm" variant="ghost" onPress={onCancel}>
                Cancel
              </Button>
            )}
            <Button size="sm" variant="danger" type="submit" isDisabled={!reason.trim()}>
              Restrict
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

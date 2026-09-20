import { useState } from "react";
import type { ExclusivityRule, ExclusivityScope } from "@bingo/shared";
import { useItemGroups } from "../../api/adminQueries";
import { Button } from "../ui/Button";
import { Field, Select } from "../ui/Field";

const SCOPE_HELP: Record<ExclusivityScope, string> = {
  tile: "one tile only: several of an item on one tile all count, but not on another tile",
  part: "one part only: an item used for Page 1 can't be used for Page 2 (or anywhere else)",
};

/**
 * The bingo's exclusive items: item groups whose items a team can use in one place only. A rule is made from a
 * site item group (a snapshot of its names) and a scope; the server refuses a claim on an item already used
 * elsewhere under it. See docs/exclusive-items-plan.md.
 */
export function ExclusiveItemsSection({ rules, onChange }: { rules: ExclusivityRule[]; onChange: (rules: ExclusivityRule[]) => void }) {
  const allGroups = useItemGroups().data?.itemGroups ?? [];
  // A group already added isn't offered again (remove it to add it afresh with the group's current items).
  const groups = allGroups.filter((g) => !rules.some((r) => r.label === g.name));
  const [groupId, setGroupId] = useState("");
  const [scope, setScope] = useState<ExclusivityScope>("tile");
  const group = groups.find((g) => g.id === groupId);

  function add() {
    if (!group) return;
    onChange([...rules, { id: crypto.randomUUID(), label: group.name, itemNames: group.itemNames, scope }]);
    setGroupId("");
  }

  return (
    <>
      <p className="text-sm text-on-surface-muted">
        Items a team can use in one place only, like a pet that counts on the boss's tile <em>or</em> on the pets tile, but not both. Matched by item name.
        Each place keeps its own copy of the item; a claim on one locks the others for that team, and a rejection frees it.
      </p>

      {rules.length === 0 ? (
        <p className="text-sm text-on-surface-subtle">No exclusive items yet.</p>
      ) : (
        <ul className="divide-y divide-outline rounded-md border border-outline">
          {rules.map((rule, i) => (
            <li key={rule.id} className="space-y-1.5 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-on-surface">{rule.label}</span>
                <span className="num text-xs text-on-surface-subtle">{rule.itemNames.length} items</span>
                <Select
                  aria-label={`Scope of ${rule.label}`}
                  value={rule.scope}
                  onChange={(e) => onChange(rules.map((r, j) => (j === i ? { ...r, scope: e.target.value as ExclusivityScope } : r)))}
                  size="sm"
                  className="ml-auto w-auto!"
                >
                  <option value="tile">One tile</option>
                  <option value="part">One part</option>
                </Select>
                <Button size="sm" variant="danger" onPress={() => onChange(rules.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
              <p className="text-xs text-on-surface-subtle">{SCOPE_HELP[rule.scope]}</p>
              <details className="text-xs text-on-surface-muted">
                <summary className="cursor-pointer select-none">Show items</summary>
                <p className="mt-1 leading-relaxed">{rule.itemNames.join(", ")}</p>
              </details>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Add from an item group" className="min-w-48 flex-1">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Choose a group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.itemNames.length})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scope">
          <Select value={scope} onChange={(e) => setScope(e.target.value as ExclusivityScope)} className="w-auto!">
            <option value="tile">One tile</option>
            <option value="part">One part</option>
          </Select>
        </Field>
        <Button onPress={add} isDisabled={!group}>
          Add
        </Button>
      </div>
      <p className="text-xs text-on-surface-subtle">
        A rule keeps the group's items as they are now: changing the group later doesn't change it. Remove and add it again to pick up changes. Save the
        settings to apply.
      </p>
    </>
  );
}

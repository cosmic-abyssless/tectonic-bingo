import { useMemo, useState } from "react";
import type { ExclusivityRule, ExclusivityScope, ItemGroup } from "@bingo/shared";
import { useItemGroups } from "../../api/adminQueries";
import { fullBoard, useBoard } from "../../api/queries";
import { boardItemSources, type ItemSource } from "../board/exclusivity";
import { addGroup, addToGroup, groupLabelOf, groupProblems, groupsOf, mergeNames, removeFromGroup, removeGroup, removeItem, renameGroup, ungroupedNames } from "./exclusiveGroups";
import { Button, IconButton } from "../ui/Button";
import { Field, Input } from "../ui/Field";
import { Select, type SelectOption } from "../ui/Select";
import { ItemSearchInput } from "../ui/ItemSearchInput";
import { XIcon } from "../ui/icons";

const SCOPE_HELP: Record<ExclusivityScope, string> = {
  tile: "one tile only: several of an item on one tile all count, but not on another tile",
  part: "one part only: an item used for Page 1 can't be used for Page 2 (or anywhere else)",
};

/** A "Start from" / "Add items from" choice: an item group, or a tile or part of this board. */
const SCOPE_OPTIONS: SelectOption[] = [
  { value: "tile", label: "One tile" },
  { value: "part", label: "One part" },
];

function sourceOptions(groups: ItemGroup[], sources: ItemSource[]): SelectOption[] {
  return [
    ...sources.map((s) => ({ value: `board:${s.key}`, label: `${s.label} (${s.itemNames.length})`, group: "Tiles and parts of this board" })),
    ...groups.map((g) => ({ value: `group:${g.id}`, label: `${g.name} (${g.itemNames.length})`, group: "Item groups" })),
  ];
}

function resolveSource(value: string, groups: ItemGroup[], sources: ItemSource[]): { label: string; itemNames: string[] } | null {
  if (value.startsWith("group:")) {
    const group = groups.find((g) => g.id === value.slice(6));
    return group ? { label: group.name, itemNames: group.itemNames } : null;
  }
  if (value.startsWith("board:")) {
    const source = sources.find((s) => s.key === value.slice(6));
    return source ? { label: source.label, itemNames: source.itemNames } : null;
  }
  return null;
}

/** One group of a rule: its name, its items, and adding one of the rule's ungrouped items or a new name to it. */
function GroupRow({ rule, index, onChange }: { rule: ExclusivityRule; index: number; onChange: (rule: ExclusivityRule) => void }) {
  const group = groupsOf(rule)[index]!;
  const [typed, setTyped] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const name = group.label.trim() || `group ${index + 1}`;
  const ungrouped = ungroupedNames(rule);

  function add(itemName: string) {
    const next = addToGroup(rule, index, itemName);
    if (typeof next === "string") {
      setRefusal(next);
      return;
    }
    setRefusal(null);
    onChange(next);
    setTyped("");
  }

  return (
    <li className="space-y-1.5 rounded-md border border-outline px-2.5 py-2" data-testid="exclusive-group">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`Name of group ${index + 1} in ${rule.label}`}
          value={group.label}
          onChange={(e) => onChange(renameGroup(rule, index, e.target.value))}
          placeholder="e.g. Bludgeon piece"
          size="sm"
          className="min-w-40 flex-1"
        />
        <Button size="sm" variant="ghost" className="text-danger" onPress={() => onChange(removeGroup(rule, index))}>
          Remove group
        </Button>
      </div>
      <ul className="flex flex-wrap gap-1.5 text-xs text-on-surface-muted">
        {group.itemNames.length === 0 && <li className="text-on-surface-subtle">No items yet</li>}
        {group.itemNames.map((itemName) => (
          <li key={itemName} className="inline-flex items-center gap-1 rounded-full border border-outline bg-surface px-2 py-0.5">
            {itemName}
            <IconButton
              size="xs"
              label={`Take ${itemName} out of ${name}`}
              onPress={() => onChange(removeFromGroup(rule, index, itemName))}
              className="-my-0.5 -mr-1.5 rounded-full hover:text-danger"
            >
              <XIcon size={12} />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {ungrouped.length > 0 && (
          <Select
            aria-label={`Add one of ${rule.label}'s items to ${name}`}
            value=""
            onChange={add}
            placeholder="Add one of the rule's items…"
            size="sm"
            className="min-w-48 flex-1"
            options={ungrouped.map((n) => ({ value: n, label: n }))}
          />
        )}
        <ItemSearchInput value={typed} onChange={setTyped} onPickItem={add} placeholder="Or a new item" ariaLabel={`Add a new item to ${name}`} containerClassName="min-w-48 flex-1" />
        <Button size="sm" onPress={() => add(typed)} isDisabled={!typed.trim()}>
          Add
        </Button>
      </div>
      {refusal && <p className="text-xs text-danger">{refusal}</p>}
    </li>
  );
}

/**
 * A rule's groups: several of its items that share one lock (the pieces of a Bludgeon), so a claim on any of them
 * locks all of them elsewhere. An item can be in only one group of a rule.
 */
function GroupsEditor({ rule, onChange }: { rule: ExclusivityRule; onChange: (rule: ExclusivityRule) => void }) {
  const [label, setLabel] = useState("");
  const groups = groupsOf(rule);
  const problems = groupProblems(rule);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-on-surface-muted">
        <span className="font-medium">Groups</span>: items that share one lock, like the pieces of a Bludgeon. A claim on any item in a group locks every item
        in it elsewhere, shown as "Used on … (the piece used)".
      </p>
      {groups.length > 0 && (
        <ul className="space-y-1.5">
          {groups.map((_, i) => (
            <GroupRow key={i} rule={rule} index={i} onChange={onChange} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={`New group in ${rule.label}`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New group, e.g. Bludgeon piece" size="sm" className="min-w-40 flex-1" />
        <Button
          size="sm"
          onPress={() => {
            onChange(addGroup(rule, label));
            setLabel("");
          }}
          isDisabled={!label.trim()}
        >
          Add group
        </Button>
      </div>
      {problems.map((p) => (
        <p key={p} className="text-xs text-warn">
          {p}
        </p>
      ))}
    </div>
  );
}

function RuleRow({
  rule,
  groups,
  sources,
  onChange,
  onRemove,
}: {
  rule: ExclusivityRule;
  groups: ItemGroup[];
  sources: ItemSource[];
  onChange: (rule: ExclusivityRule) => void;
  onRemove: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [sourceValue, setSourceValue] = useState("");
  const source = resolveSource(sourceValue, groups, sources);

  function addTyped(name: string) {
    onChange({ ...rule, itemNames: mergeNames(rule.itemNames, [name]) });
    setTyped("");
  }

  return (
    <li className="space-y-2 px-3 py-2.5" data-testid="exclusive-rule">
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Rule name" value={rule.label} onChange={(e) => onChange({ ...rule, label: e.target.value })} size="sm" className="min-w-40 flex-1" />
        <Select
          aria-label={`Scope of ${rule.label}`}
          value={rule.scope}
          onChange={(scope) => onChange({ ...rule, scope: scope as ExclusivityScope })}
          size="sm"
          className="w-auto!"
          options={SCOPE_OPTIONS}
        />
        <Button size="sm" variant="danger" onPress={onRemove}>
          Remove
        </Button>
      </div>
      <p className="text-xs text-on-surface-subtle">{SCOPE_HELP[rule.scope]}</p>

      <details className="text-xs text-on-surface-muted">
        <summary className="cursor-pointer select-none">
          <span className="num">{rule.itemNames.length}</span> items{rule.itemNames.length === 0 && " (add at least one before saving)"}
        </summary>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {rule.itemNames.map((name) => {
            const group = groupLabelOf(rule, name);
            return (
              <li key={name} className="inline-flex items-center gap-1 rounded-full border border-outline bg-surface px-2 py-0.5">
                {name}
                {group !== null && <span className="text-on-surface-subtle">· {group}</span>}
                <IconButton
                  size="xs"
                  label={`Remove ${name} from ${rule.label}`}
                  onPress={() => onChange(removeItem(rule, name))}
                  className="-my-0.5 -mr-1.5 rounded-full hover:text-danger"
                >
                  <XIcon size={12} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      </details>

      <GroupsEditor rule={rule} onChange={onChange} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Add an item or an item group" className="min-w-48 flex-1">
          <ItemSearchInput
            value={typed}
            onChange={setTyped}
            onPickItem={addTyped}
            itemGroups={groups}
            onPickGroup={(g) => {
              onChange({ ...rule, itemNames: mergeNames(rule.itemNames, g.itemNames) });
              setTyped("");
            }}
            placeholder="Search items"
            ariaLabel={`Add an item to ${rule.label}`}
          />
        </Field>
        <Button size="sm" onPress={() => addTyped(typed)} isDisabled={!typed.trim()}>
          Add item
        </Button>
        <Field label="Or everything on" className="min-w-48 flex-1">
          <Select
            aria-label={`Add items to ${rule.label} from`}
            value={sourceValue}
            onChange={setSourceValue}
            placeholder="Choose a tile, part or group…"
            options={sourceOptions(groups, sources)}
          />
        </Field>
        <Button
          size="sm"
          onPress={() => {
            if (!source) return;
            onChange({ ...rule, itemNames: mergeNames(rule.itemNames, source.itemNames) });
            setSourceValue("");
          }}
          isDisabled={!source}
        >
          Add all
        </Button>
      </div>
    </li>
  );
}

/**
 * The bingo's exclusive items: sets of items a team can use in one place only. A rule is a name, a scope and a
 * list of item names (a snapshot: it isn't linked to the group or tile it was started from). It can be started
 * from a tile or part of the board, an item group or nothing, and the items edited one by one, because a
 * tile's items rarely match a group. Some of a rule's items can be put in a named group that shares one lock (any
 * piece of a Bludgeon). The server refuses a claim on an item already used elsewhere under it.
 * See docs/exclusive-items-plan.md.
 */
export function ExclusiveItemsSection({ slug, rules, onChange }: { slug: string; rules: ExclusivityRule[]; onChange: (rules: ExclusivityRule[]) => void }) {
  const groups = useItemGroups().data?.itemGroups ?? [];
  const tiles = fullBoard(useBoard(slug).data)?.tiles;
  const sources = useMemo(() => boardItemSources(tiles ?? []), [tiles]);
  const [sourceValue, setSourceValue] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ExclusivityScope>("tile");
  const source = resolveSource(sourceValue, groups, sources);
  const label = name.trim() || source?.label || "";

  function add() {
    if (!label) return;
    onChange([...rules, { id: crypto.randomUUID(), label, itemNames: mergeNames([], source?.itemNames ?? []), scope }]);
    setSourceValue("");
    setName("");
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
            <RuleRow
              key={rule.id}
              rule={rule}
              groups={groups}
              sources={sources}
              onChange={(next) => onChange(rules.map((r, j) => (j === i ? next : r)))}
              onRemove={() => onChange(rules.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Start from" className="min-w-48 flex-1">
          <Select value={sourceValue} onChange={setSourceValue} options={[{ value: "", label: "Nothing (add items one by one)" }, ...sourceOptions(groups, sources)]} />
        </Field>
        <Field label="New rule name" className="min-w-40">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={source?.label ?? "e.g. Slayer boss uniques"} />
        </Field>
        <Field label="Scope">
          <Select value={scope} onChange={(s) => setScope(s as ExclusivityScope)} className="w-auto!" options={SCOPE_OPTIONS} />
        </Field>
        <Button onPress={add} isDisabled={!label}>
          Add rule
        </Button>
      </div>
      <p className="text-xs text-on-surface-subtle">
        A rule keeps the items it was started with: changing the tile or group later doesn't change it. Edit the items here, or remove the rule and add it
        again. Save the settings to apply.
      </p>
    </>
  );
}

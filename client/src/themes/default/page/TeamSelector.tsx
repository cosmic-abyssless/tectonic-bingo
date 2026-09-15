import type { TeamSelectorModel } from "../../../headless/types";
import { Button } from "../../../core/ui/Button";
import { Menu, MenuItem, MenuTrigger } from "../../../core/ui/Menu";
import { ChevronDownIcon } from "../../../core/ui/icons";
import { teamBadgeStyle } from "./TeamBadge";

export function TeamSelector({ selector }: { selector: TeamSelectorModel }) {
  const selected = selector.teams.find((t) => t.id === selector.selectedId) ?? null;

  return (
    <MenuTrigger>
      <Button size="sm" style={selected ? teamBadgeStyle(selected) : undefined}>
        {selected?.color && <span className="size-2 rounded-full" style={{ backgroundColor: selected.color }} />}
        {selected?.name ?? "Select team"}
        <ChevronDownIcon className="text-on-surface-subtle" />
      </Button>
      <Menu onAction={(key) => selector.select(String(key))}>
        {selector.teams.map((team) => (
          <MenuItem key={team.id} id={team.id}>
            {team.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />}
            <span className="truncate">{team.name}</span>
            {team.isMine && <span className="ml-auto text-[10px] text-on-surface-subtle">you</span>}
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  );
}

import { DISCORD_TEAM_PLACEHOLDER, MAX_DISCORD_CHANNELS, discordChannelName, discordChannelsProblem, type DiscordChannelTemplate, type DiscordChannelType } from "@bingo/shared";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Card";
import { Input } from "../ui/Field";
import { Select } from "../ui/Select";
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "../ui/icons";

const PREVIEW_TEAM = "Red Dragons";

/**
 * The channels every Team gets in Discord (Settings > Discord), in the order they sit under each Team. An entry keeps
 * its key while edited, so on save a renamed entry renames each Team's channel (messages kept); a new one is made
 * for every Team; a removed one (or one switched between text and voice) is deleted from every Team, messages and all.
 */
export function DiscordChannelsEditor({ channels, onChange }: { channels: DiscordChannelTemplate[]; onChange: (channels: DiscordChannelTemplate[]) => void }) {
  const set = (i: number, patch: Partial<DiscordChannelTemplate>) => onChange(channels.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...channels];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    onChange(next);
  };
  const problem = discordChannelsProblem(channels);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-on-surface">Channels per team</p>
      {channels.length === 0 && <p className="text-sm text-on-surface-muted">None: teams get only their role.</p>}
      {channels.map((c, i) => (
        <div key={c.key} className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Channel type"
            value={c.type}
            onChange={(type) => set(i, { type: type as DiscordChannelType })}
            className="w-28!"
            options={[
              { value: "text", label: "Text" },
              { value: "voice", label: "Voice" },
            ]}
          />
          <Input aria-label="Channel name" value={c.name} onChange={(e) => set(i, { name: e.target.value })} className="min-w-40 flex-1" />
          <span className="w-44 truncate text-sm text-on-surface-muted" title="How it looks for a team called Red Dragons">
            {c.type === "text" ? "#" : "🔊 "}
            {discordChannelName(c, PREVIEW_TEAM)}
          </span>
          <Button variant="ghost" size="sm" aria-label="Move up" onPress={() => move(i, -1)} isDisabled={i === 0}>
            <ChevronUpIcon size={14} />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Move down" onPress={() => move(i, 1)} isDisabled={i === channels.length - 1}>
            <ChevronDownIcon size={14} />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Remove channel" onPress={() => onChange(channels.filter((_, j) => j !== i))}>
            <TrashIcon size={14} />
          </Button>
        </div>
      ))}
      <Button size="sm" onPress={() => onChange([...channels, { key: crypto.randomUUID().slice(0, 8), type: "text", name: `${DISCORD_TEAM_PLACEHOLDER}-` }])} isDisabled={channels.length >= MAX_DISCORD_CHANNELS}>
        Add channel
      </Button>
      <p className="text-sm text-on-surface-muted">
        {DISCORD_TEAM_PLACEHOLDER} is the team's name. Saving applies the list to every team: a renamed channel is renamed (its messages stay), a new one is
        made, and a removed one, or one switched between text and voice, is deleted with its messages.
      </p>
      {problem && <Notice tone="warn">{problem}</Notice>}
    </div>
  );
}

/** What saving `next` over `saved` deletes in Discord: entries removed, or switched between text and voice. */
export function discordChannelsDeleted(saved: DiscordChannelTemplate[], next: DiscordChannelTemplate[]): DiscordChannelTemplate[] {
  return saved.filter((s) => {
    const kept = next.find((n) => n.key === s.key);
    return !kept || kept.type !== s.type;
  });
}

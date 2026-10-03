# Discord team sync

Gives every Team of a Bingo its own place in the clan's Discord server, and keeps it up to date.

Code: `server/src/services/discordTeamService.ts`. Settings: a Bingo's **Settings > Discord** (Admins).

## What it makes

Per Bingo, one **category**: one the bot makes for it (named after the Bingo, or the **Category name** set in the
settings), or an existing one (see [Where new channels go](#where-new-channels-go)). Per Team, in it:

| Per Team | Name | Who can see it |
| --- | --- | --- |
| Role | The Team's name, in the Team's color, mentionable | Given to each of the Team's Players |
| One channel per entry of the **channel list** | The entry's name with `{team}` swapped for the Team's (a text channel as Discord writes it: `{team}-loot` is `red-dragons-loot`) | The Team's role and the bot |

The channel list starts as a text and a voice channel, both just `{team}`. `@everyone` is denied View Channel on all of
it, so a Team's channels are private to it. No moderator role: Moderators see a Team's channels only if they are on it
(or are Discord admins).

## The channel list

Settings > Discord has a small editor: each entry is a type (text or voice) and a name with `{team}` in it (required,
or every Team's channel would have the same name), with a live preview, up/down to reorder, and remove. Up to 10.
Saving applies it to every Team at once:

- **Renamed** entry: each Team's channel is renamed, messages kept. Every entry has a stable `key`, and each Team's
  channel is stored against it (`discord_resources.channel_key`), so a rename is an edit of the same channel, not a new
  one.
- **New** entry: a channel is made for every Team.
- **Removed** entry, or one **switched between text and voice** (Discord can't change a channel's type): every Team's
  channel for it is deleted, with its messages, and for a switch a new one made. The settings ask before saving that.
- **Reordered**: each Team's channels move to the new order.

### Where new channels go

Into **one category per Bingo**, either:

- **one the sync makes** (the default), named after the Bingo or the **Category name**. It remembers it
  (`discord_resources`, kind `category`); if someone deletes it in Discord, the next sync makes it again and moves the
  channels back in; or
- **an existing category** whose ID is set as **Existing category ID** (Developer Mode, right-click the category, Copy
  Channel ID). The sync never renames, re-permissions or deletes it, and **Remove from Discord** leaves it (and the
  server's own channels in it) alone. Each sync checks it's a category in the server; if not, it stops and says so.

Changing between them, or to another existing category, moves every Team's channel there (messages kept); a category
the sync had made is deleted once its channels have moved out.

Inside the category, Teams follow their draft order and each Team's channels the list's order (each channel's
`position`), so a channel added later lands next to its Team's others rather than at the bottom. In an existing
category the Teams' channels go after the channels already in it. Discord itself always shows a category's text
channels above its voice channels.

## When

- From the moment the **Draft finishes** (Board revealed, Live, Finished), the same moment the Wise Old Man
  competition is made, while the Bingo's **Discord** switch is on.
- After everything that changes a Team from then on: a Team created, renamed, recolored or deleted, a Player removed
  from a Team or signed up late, a Cut review applied, a stage change, and the Bingo's name or Discord settings (switch,
  category, channel list) being saved.
- Each sync compares what the Bingo wants with what it last sent and only sends the difference: a rename edits one role
  and that Team's channels, and nothing else is touched.
- Discord allows a channel **two renames per 10 minutes**. A third waits for Discord: instead of holding every other
  change behind it, the sync stops, shows "Discord's rate limit holds ... for Ns; trying again then" in the settings,
  and runs again by itself once the wait is over. (Short waits are just waited out.)
- **Sync now** re-sends everything. That also puts back a role or channel someone changed or deleted by hand in
  Discord, and gives the role to Players who have joined the server since.
- Never for a `testdata-` Bingo (the test data generator's) or a Historical Bingo.

## What it leaves alone

- A role the sync didn't give: it only takes a Team's role from Players it gave it to, so someone an Admin gave the
  role to by hand keeps it.
- Players who aren't in the server (`users.in_guild` false at their last login, or unknown to Discord): skipped, and
  given the role on a later sync once they've joined.
- Everything, when the Bingo is Finished. **Remove from Discord** in the settings turns the sync off and deletes every
  role and channel it made for the Bingo (and their messages). Deleting a Bingo does the same by itself.

If Discord refuses partway through **Remove from Discord**, the sync is still turned off, the panel says what was
refused, and what's left stays listed so it can be removed again.

A failure (missing permission, Discord down) is shown in the settings panel and recorded once in the audit log
(`discord.sync_failed`); what was changed is recorded as `discord.synced`. It never blocks the change that set it off.

## Setup (once, by whoever runs the Discord server)

1. In the [Discord developer portal](https://discord.com/developers/applications), open the app the site already logs in
   with (or a new one), and under **Bot** reset/copy its token. No privileged intents are needed: the sync only uses
   the REST API, never a gateway connection.
2. Invite the bot to the clan server with these permissions. A bot can only grant permissions it has itself, so it
   needs every one it hands to the Teams:
   - Manage Roles, Manage Channels
   - View Channels, Send Messages, Read Message History, Add Reactions, Attach Files, Embed Links
   - Connect, Speak, Video (Stream), Use Voice Activity

   Invite link with exactly those (replace `CLIENT_ID` with the app's id):
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot&permissions=305253968`
   (Administrator works too, if you'd rather.)
3. In **Server Settings > Roles**, drag the bot's role **above** where Team roles should go: a bot can only manage roles
   below its own. New Team roles are made at the bottom of the list.
4. Set `DISCORD_BOT_TOKEN` on the server (and `DISCORD_GUILD_ID`, which login already uses). Restart.
5. In a Bingo's **Settings > Discord**, turn it on, adjust the category name and channel list if you like, and save.

## Trying it on a test Discord server (dev servers only)

On a dev server (`DEV_LOGIN_ENABLED=true` and not `NODE_ENV=production`, so local and staging), Settings > Discord also
has a **Discord server ID**: the bingo then syncs there instead of `DISCORD_GUILD_ID`. Production never shows it and
refuses it, and ignores one already stored.

1. Make a Discord server (or use one you own) and invite the bot to it with the link above.
2. Copy its ID (Developer Mode, right-click the server, Copy Server ID) into the field, turn the sync on, save.
3. Players get their Team's role only if they're in that server (`users.in_guild` is about the clan's server, so it's
   not used there; Discord's "Unknown Member" answer is). Join it with your own account to see your Team's channels.

Every role and channel remembers the server it was made in (`discord_resources.guild_id`) and is edited and deleted
there, so **Remove from Discord** always cleans up the right server. The server ID can't be changed while anything is
left in the old one (remove first), and a sync never splits a bingo across two servers: if it finds the bingo's things
in another server, it stops and says so.

## Data

- `bingos.discord_enabled`, `discord_guild_id` (dev servers only), `discord_category_id`, `discord_category_name`, `discord_channels_json` (the channel list, `DiscordChannelTemplate`
  in `shared/src/discord.ts`), `discord_sync_error`, `discord_synced_at`.
- `discord_resources`: one row per category, role or channel made, with the server it's in (`guild_id`), a channel with its list entry's `channel_key`, and
  what was last sent (`applied_json`; for a role, the Discord ids it was given to). No foreign keys, so the rows outlive a deleted Team or Bingo and the sync can still
  delete what was left behind.

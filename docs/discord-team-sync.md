# Discord team sync

Gives every Team of a Bingo its own place in the clan's Discord server, and keeps it up to date.

Code: `server/src/services/discordTeamService.ts`. Settings: a Bingo's **Settings > Discord** (Admins).

## What it makes

Per Bingo, under a **category named after the Bingo**:

| Per Team | Name | Who can see it |
| --- | --- | --- |
| Role | The Team's name, in the Team's color, mentionable | Given to each of the Team's Players |
| Text channel | The Team's name as Discord writes it (`red-dragons`) | The Team's role, the bot, and the staff role if set |
| Voice channel | The Team's name | The same |

`@everyone` is denied View Channel on all of them, so a Team's channels are private to it.

## When

- From the **Draft** on (Draft, Board revealed, Live, Finished), while the Bingo's **Discord** switch is on. Before the
  Draft, Captains (and so Teams) still come and go.
- After everything that changes a Team: a Draft pick (or undo), a Team created, renamed, recolored or deleted, a Player
  removed from a Team or signed up late, a Cut review applied, a stage change, and the Bingo's name or Discord settings
  being saved.
- Each sync compares what the Bingo wants with what it last sent and only sends the difference. A Draft pick is one
  role assignment; a rename edits one role and two channels. (Discord allows a channel two renames per 10 minutes.)
- **Sync now** in the settings re-sends everything. That also puts back a role or channel someone changed or deleted
  by hand in Discord, and gives the role to Players who have joined the server since.
- Never for a `testdata-` Bingo (the test data generator's) or a Historical Bingo.

## What it leaves alone

- A role the sync didn't give: it only takes a Team's role from Players it gave it to, so someone an Admin gave the
  role to by hand keeps it.
- Players who aren't in the server (`users.in_guild` false at their last login, or unknown to Discord): skipped, and
  given the role on a later sync once they've joined.
- Everything, when the Bingo is Finished. **Remove from Discord** in the settings turns the sync off and deletes every
  role and channel it made for the Bingo (and their messages). Deleting a Bingo does the same by itself.

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
5. In a Bingo's **Settings > Discord**, turn it on and save. Optionally set a **staff role ID** (Developer Mode,
   right-click the role, Copy Role ID) whose members may see every Team's channels.

## Data

- `bingos.discord_enabled`, `discord_staff_role_id`, `discord_sync_error`, `discord_synced_at`.
- `discord_resources`: one row per role or channel made, with what was last sent (`applied_json`; for a role, the
  Discord ids it was given to). No foreign keys, so the rows outlive a deleted Team or Bingo and the sync can still
  delete what was left behind.

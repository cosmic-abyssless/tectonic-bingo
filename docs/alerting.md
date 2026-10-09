# Alerting

How we hear about production trouble. Set up after the 2026-10-03 incident (`docs/postmortems/2026-10-03-colour-picker.md`), tracked in #453.

## Where alerts go

A private Discord channel, `#bingo-alerts`, in the clan's server. Its pinned message explains to Moderators what each alert means and what to do.

Sentry posts there through **Sentry's own Discord integration** (the integration is named after the server; Sentry's bot has View Channel, Send Messages and Embed Links in the channel). Our own `DISCORD_BOT_TOKEN` bot is deliberately not used: alerts must come from outside the server they're about.

This needs Sentry's **Team** plan or above. On the free Developer plan, Sentry can only alert by email.

## The Sentry alerts

Both cover the `production` environment only, so staging and the test data generator never post.

| Alert | Projects | Fires on | At most |
|---|---|---|---|
| New and regressed issues to #bingo-alerts | `tectonic-server`, `tectonic-client` | a new issue, or a resolved one coming back | every 30 min per issue |
| Load warnings to #bingo-alerts | `tectonic-server` | every event tagged `load_warning` | every 10 min per issue |

The second exists because a load warning (`server/src/loadWarnings.ts`) stays one open issue per kind. A repeat in a later incident is neither new nor regressed, so the first alert alone would miss it.

**The load warnings** (#452):
- slow requests;
- event-loop lag;
- one user's write flood;
- request spikes;
- writes refused by the per-user limit (#454).

The server throttles each to once per 10 minutes. Their thresholds are env vars, see `.env.example`.

To check the Discord side, open either alert in Sentry and press **Send test notification**.

## Still to do (#453)

- An outside uptime check on `https://tectonic.bingo/api/health`, every 1-3 minutes with a ~5 s timeout. Either Sentry Uptime Monitoring (one monitor is included), or UptimeRobot / Better Stack posting to a Discord webhook. Phone push for downtime.

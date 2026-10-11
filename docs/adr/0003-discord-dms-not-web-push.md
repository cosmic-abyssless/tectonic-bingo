# Notifications reach people off-site by Discord DM, not Web Push

A Notification is delivered by the first step that applies: a toast while the site is open and in view, a browser notification (the plain `Notification` API, which needs an open tab) while the site is open but not in view, and a Discord DM from the clan's bot when it isn't open at all. Users opt into the steps in order, on one setting (Off, In the app, + Browser, + Discord), so DMs are only ever the last fallback.

There is no Web Push, no service worker and no installable PWA. Every user signs in with Discord and is in the clan's server, and the bot already exists, so a DM reaches every phone, iPhone included, with nothing to install.

## Considered Options

- **Web Push with a PWA:** reaches phones and closed browsers without Discord, but on iPhone only once the site is added to the Home Screen, which few would do. It also needs a service worker, VAPID keys, per-device subscriptions and a device list.
- **Both:** two off-site channels to build, explain and keep from doubling up.

## Consequences

- A user who has turned off DMs from server members, or left the server, gets no DMs. Discord says so when a send fails (error 50007), so the settings page shows "Can't reach you on Discord" with a Try again that sends a test DM, and the bot stops trying for that user until then.
- Off-site delivery depends on the bot's token being set. Without it the + Discord step is hidden and everything else works.
- Browser notifications only fire while a tab of the site is open, since there is no service worker. A closed browser is the Discord step's job.
- Adding Web Push later means building the whole PWA side from scratch; it would slot in as another step before Discord.

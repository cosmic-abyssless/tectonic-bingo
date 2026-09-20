// The text of the Terms of Service and the Privacy Policy, shown at /terms and /privacy (no login needed, so the
// links can be given to Discord). Edit the wording here. When behaviour changes (new data collected, a new service
// contacted, a new cookie), update the policy and LEGAL_UPDATED together.

/** When the documents last changed. */
export const LEGAL_UPDATED = "September 20, 2026";

/** How people reach the people who run the site. Replace with a monitored address if there is one. */
export const LEGAL_CONTACT = "Message a moderator or administrator in the Tectonic Discord server.";

export const TERMS_MD = `
# Terms of Service

Last updated: ${LEGAL_UPDATED}

These terms cover your use of Tectonic Bingo ("the site"), a website that tracks bingo events run by the Tectonic Old School RuneScape clan. By logging in or using the site you agree to them. If you don't agree, please don't use the site.

## What the site is

The site lets clan members sign up for a bingo, be drafted onto teams, submit screenshots as proof of in-game drops and achievements, and follow scores and stats. It is run by volunteers from the clan. It is not affiliated with, endorsed by, or sponsored by Jagex Ltd, Discord Inc., Wise Old Man, or RuneProfile. Old School RuneScape and RuneScape are trademarks of Jagex Ltd.

## Who can use it

- You need a Discord account, and you log in with it. You must follow Discord's [Terms of Service](https://discord.com/terms) and [Community Guidelines](https://discord.com/guidelines) when you use the site, as well as these terms.
- The site is for members of the Tectonic Discord server. If your account isn't in the server, you can log in but you can't use the bingo pages.
- You must be old enough to use Discord (Discord requires users to be at least 13, or older where local law says so).

## Your account

You are responsible for what happens under your account. Don't share your login session, and tell a moderator if you think someone else is using your account. Your name on the site is the RuneScape name (RSN) you sign up with; keep it to a name you actually play on.

## What you submit

You may be asked for your RSN, answers to signup questions, and screenshots of your own game. By submitting them you confirm that:

- the screenshots show your own genuine in-game progress, unedited (apart from cropping or hiding things that aren't part of the game), and include whatever proof the event asks for, such as your team's codeword;
- you have the right to share them, and they don't show private information, other people's personal details, or anything unlawful, abusive, or hateful.

You keep ownership of what you submit. You give the organisers permission to store it and to show it to your team, the moderators, and the other participants where the site displays it (for example on the board, in submissions, and in results), for as long as it is needed to run the event and keep its results.

## Fair play and moderation

- Play fairly. Faked, edited, or reused screenshots, using another player's drops, and other cheating can be rejected, and the people involved can be removed from an event.
- Moderators review submissions and decide whether to approve or reject them, and they can adjust points, edit teams, and remove signups or submissions. Their decisions on an event's scoring are final, though you can ask a moderator to look again.
- Any buy-in or prize (for example an in-game gold pot) is arranged by the clan's organisers outside the site. The site only records things like whether a buy-in has been marked as received. It does not handle payments, and it is not responsible for prizes.

## Acceptable use

Don't try to break, overload, or gain unauthorised access to the site or anyone else's data; don't scrape it or use automated tools against it beyond what your browser does normally; and don't use it to harass anyone or to impersonate someone else. Reports of bugs or security problems are welcome; please send them privately to a moderator.

## Changes and availability

The site is provided free of charge and "as is", by volunteers. It may be slow, change, or be unavailable, and features and data may be changed or removed, for example between events or when a bingo is deleted. We don't promise that it will always work or that nothing will be lost.

## Ending access

You can stop using the site at any time, and you can ask for your data to be deleted as described in the [Privacy Policy](/privacy). The organisers can suspend or remove your access, for example for breaking these terms or the rules of an event or of the Discord server.

## Liability

To the extent the law allows, the people who run the site aren't liable for any loss or damage that comes from using it, including lost data, lost progress, or missed prizes. Nothing in these terms limits any right you have that can't legally be limited.

## Changes to these terms

We may update these terms. The date at the top shows when they last changed. If you keep using the site after a change, you accept the new terms.

## Contact

${LEGAL_CONTACT}

See also the [Privacy Policy](/privacy).
`;

export const PRIVACY_MD = `
# Privacy Policy

Last updated: ${LEGAL_UPDATED}

This explains what information Tectonic Bingo ("the site") collects, why, who can see it, and what your choices are. The site is run by volunteers from the Tectonic Old School RuneScape clan, who are responsible for the information described here. It has no advertising and no analytics or tracking tools, and we don't sell or rent your information, and we don't use it to contact you outside Discord.

## What we collect

**From Discord, when you log in.** You log in with Discord and approve two permissions: \`identify\` and \`guilds.members.read\`. From them we receive and store your Discord user ID, username, display name, avatar, and your nickname in the Tectonic Discord server, plus whether you are a member of it. We use the second permission only to look up your own member record in the Tectonic server. We do not receive your email address, your messages, your friends, or your other servers, and we don't keep the access token Discord gives us: it is used once at login.

**When you sign up for a bingo.** Your RuneScape name (RSN), your answers to the signup questions, any duo partner you request or accept, and notes such as whether your buy-in has been marked as received.

**When you play.** Screenshots you submit and what you claim with them, your team, the tiles you say you want to do, and the points and results that follow. Moderators also record their reviews and any point adjustments.

**Public game information about your RSN.** When you sign up, the site looks up public information about your RSN (for example efficiency stats, account type, and combat achievements) so that teams can be built fairly, and it shows what it finds to moderators, team leads, and in the draft.

**Clan information.** The site checks your Discord ID against the clan's own member service to see whether you are a registered clan member, which RSNs are linked to you, and your clan profile (such as your tier and points).

**Automatically.** Your session cookie (see below); server logs of each request (the address requested, the result, how long it took, and your account ID or a request ID); error reports sent from your browser if something breaks (the error message, the page, and technical details); and an audit log of actions taken on the site (who did what, and when), which is tied to your account.

**If you send a bug report.** What you write, the page you were on, your browser's user agent, and the theme and colour setting in use.

## How we use it

To run the event: to check you are a clan member, sign you up, build teams and drafts, verify submissions, score the board, show results and stats, and keep a record of what happened. To keep the site secure and working. We don't use your information for anything unrelated, and we don't do profiling or advertising.

Screenshots are read by software running on our own server to look for your team's codeword and matching items. They are not sent to any other company for that.

## Who can see it

- **Inside a bingo**, people see you by your RSN. Your teammates can see your team's roster and submissions. Other participants can see the board and, once a bingo is over, its results and stats. Moderators and administrators can see signups, answers, submissions, stats, and the audit log. Your answers to signup questions are visible to moderators and team leads.
- The site requires a Discord login to view anything about a bingo. These two pages are public.
- The site's administrators can see everything on the site.

## Who we share it with

We don't sell or rent your information. The site sends limited information to these services so it can work:

- **Discord**, to log you in and check your server membership.
- **Wise Old Man** and **RuneProfile**, which receive your RSN so the site can fetch public stats.
- **The Tectonic clan member service** (the clan's own system for its member list), which receives Discord IDs so the site can check clan membership and profile information. It acts for the clan, and the site uses what it returns only for that purpose.
- **The OSRS Wiki**, which receives item searches typed by moderators when building a board, and which your browser loads item icons from.
- **Our hosting provider**, which stores the site's data and logs on our behalf.

Your browser also loads avatars and emoji from Discord's content network, and fonts from Google Fonts, which means those companies can see your IP address as they would on any website.

## Cookies and browser storage

The site sets one cookie, a session cookie that keeps you logged in. It is needed for the site to work, is not readable by scripts on the page, and expires after 7 days. Your browser also keeps a few things locally: your display preferences (such as light or dark and which table columns to show), a cache of board data so pages load faster, and whether you've been asked about notifications. There are no advertising or tracking cookies. You can clear this data in your browser at any time; you'll need to log in again.

## How long we keep it

Login sessions expire after 7 days. Your account record, signups, submissions, screenshots, and the audit log are kept as long as they are needed to run events and keep their results (for example so that scores can be checked and disputes settled), until an organiser deletes the bingo or you ask us to delete your information. If the site stops running, we will delete the information it holds. Server logs are kept by our hosting provider for a limited time. You can withdraw your signup yourself while signups are open.

## Your choices and rights

We handle your information because it is needed to run the events you ask to take part in (and, for the log of what happened on the site, to keep the site secure and its results fair).

You can ask us to:

- show you the information we hold about you, or give you a copy;
- correct it (for example a wrong RSN);
- delete it, including the Discord information we stored when you logged in;
- stop using it in a way you object to.

Contact us using the details below and we'll act on a request within 30 days. When we delete your information, we may keep an event's results and the log of what happened in a form that no longer identifies you, and we may keep what the law requires us to. Removing the site's permissions in your Discord settings stops it from checking your membership, but it doesn't delete what is already stored, so ask us to do that. If you are in a country with a privacy regulator and you are unhappy with how we handle your information, you can also complain to that regulator.

If your personal information is ever accessed or exposed without authorisation, we will tell the people affected, and Discord, as the law and Discord's developer terms require.

## Security

We use encrypted connections, keep login sessions in a cookie scripts can't read, and limit administrative access to a small group of moderators and administrators. No system is completely secure, so please don't submit screenshots that show information you wouldn't want your team and the moderators to see.

## Children

The site isn't meant for anyone below the minimum age to use Discord, and we don't knowingly collect their information. If you believe a child has signed up, tell us and we'll remove it.

## Changes

We may update this policy. The date at the top shows when it last changed. If the changes are significant, we'll say so on the site or in the Discord server.

## Contact

${LEGAL_CONTACT}

See also the [Terms of Service](/terms).
`;

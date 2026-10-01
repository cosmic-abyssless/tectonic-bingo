# Permissions: roles in code, stages in grants, Restrictions on top

Who can do what in a Bingo is decided by one `can()` that the server and client share (#328). Roles and the Actions they grant are defined in code, not in the database. A Bingo runs about every 6 months, so a new Action or role ships with a deploy between Bingos. Each new Action then gets one line saying which roles have it, with no migration and no table of rules to keep in sync with the code. What an admin *can* change mid-Bingo is who holds a role, per-user Restrictions and per-Bingo settings. Editable roles can come later if a real mid-Bingo case for them turns up.

A grant can be limited to certain stages ("a Captain renames their Team during Board revealed"). A rule that holds for *everyone*, Admins included ("a Finished Bingo is locked"), is not a grant. It stays a domain rule that every grant passes through, so new grants can't forget it.

The narrowest scope wins: Admin (site-wide), then a Bingo role (Moderator, Staff, Captain, Player), then a Restriction on one user in one Bingo. Roles combine, and a Restriction beats any role. There are no one-off grants to a single user, because then nobody can tell what someone can do by looking at their roles. Admins can't be restricted, because they are the ones who lift Restrictions.

Wildcards (`signups.*`) are allowed only where they fail closed: in Restrictions, and in Admin's `*`. Every other role lists its Actions in full, so a new sensitive Action is never quietly granted to a role.

## Considered Options

- **Bitmasks:** they save no real space at this scale, make the database and audit log unreadable, and need fixed bit positions.
- **Team-scoped permissions:** no real case. A rule about one person is a Restriction, and a rule about the Bingo is a setting.
- **Stage rules as permission bits:** something still has to flip the bits when the stage moves on, which hides the logic.
- **Negative roles:** a named bundle of denies would be a second system that takes Actions away. A bundle of Restrictions, defined in code, covers the same need.

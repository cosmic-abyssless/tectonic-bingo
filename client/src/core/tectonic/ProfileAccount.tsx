import { useState } from "react";
import { Button } from "../ui/Button";
import { BorrowedAccountForm, type AccountTarget } from "../mod/BorrowedAccountDialog";

/**
 * The player card's Account section (its Permissions tab), for an Admin from Signups closed until Finished: the OSRS
 * account the player is on, and Set borrowed account (CONTEXT.md "Borrowed account") right there.
 */
export function ProfileAccount({ slug, target }: { slug: string; target: AccountTarget }) {
  const [editing, setEditing] = useState(false);
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-subtle">Account</h3>
      {editing ? (
        <BorrowedAccountForm slug={slug} target={target} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-on-surface-muted [&_strong]:text-on-surface">
            {target.accountBorrowed ? (
              <>
                Playing this bingo on <strong>{target.rsn}</strong>, a borrowed account (set by an Admin).
              </>
            ) : (
              <>
                Playing this bingo on their own account, <strong>{target.rsn}</strong>.
              </>
            )}
          </p>
          <Button size="sm" onPress={() => setEditing(true)}>
            Set borrowed account…
          </Button>
        </div>
      )}
    </section>
  );
}

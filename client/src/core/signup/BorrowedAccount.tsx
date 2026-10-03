import { useMySignup } from "../../api/queries";
import { Badge, Notice } from "../ui/Card";
import { InfoIcon } from "../ui/icons";

/**
 * Marks a Player whose Signup is on a Borrowed account (CONTEXT.md "Borrowed account"), on their roster row and player
 * card, with their own name: inside the Bingo they're named by the account they play on.
 */
export function BorrowedBadge({ ownName, className = "" }: { ownName: string; className?: string }) {
  return (
    <Badge tone="info" className={`min-w-0 ${className}`}>
      <span className="truncate">borrowed · {ownName}</span>
    </Badge>
  );
}

/** The Player's own Signup on a Borrowed account, above the page: which account they play on, and who set it. */
export function BorrowedAccountNotice({ slug }: { slug: string }) {
  const { data } = useMySignup(slug);
  const signup = data?.signup;
  if (!signup || signup.status !== "active" || !signup.accountBorrowed) return null;
  return (
    <Notice tone="info" icon={<InfoIcon />} className="mb-4">
      You're playing on <strong>{signup.rsn}</strong> (set by an Admin).
    </Notice>
  );
}

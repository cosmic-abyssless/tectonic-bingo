import { Badge } from "../ui/Card";

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

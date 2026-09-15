import { createContext, useContext, useState, type ReactNode } from "react";
import { PlayerProfileDialog } from "./PlayerProfileDialog";

const OpenProfileContext = createContext<((userId: string) => void) | null>(null);

/**
 * Hosts one PlayerProfileDialog per page so any `<PlayerName>` inside can open
 * it. Pages without the provider render names as plain text.
 */
export function PlayerProfileProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  return (
    <OpenProfileContext.Provider value={setUserId}>
      {children}
      <PlayerProfileDialog slug={slug} userId={userId} onClose={() => setUserId(null)} />
    </OpenProfileContext.Provider>
  );
}

/**
 * A player's name that opens their profile. Dotted underline + hover colour
 * mark it as interactive without looking like a navigation link.
 */
export function PlayerName({ userId, children, className = "" }: { userId: string; children: ReactNode; className?: string }) {
  const open = useContext(OpenProfileContext);
  if (!open) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(userId);
      }}
      title="View player profile"
      className={`cursor-pointer rounded-sm text-left underline decoration-on-surface-subtle/60 decoration-dotted underline-offset-[3px] transition-colors hover:text-on-surface hover:decoration-on-surface hover:decoration-solid focus-visible:decoration-on-surface focus-visible:decoration-solid focus-visible:outline-none ${className}`}
    >
      {children}
    </button>
  );
}

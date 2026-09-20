import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "@bingo/shared";
import { useAuth } from "../context/AuthContext";
import { displayName } from "../core/ui/user";
import { Button } from "../core/ui/Button";
import { Notice } from "../core/ui/Card";
import { AlertIcon } from "../core/ui/icons";

// Dev-only — the /auth/dev-users fetch 404s (and this renders nothing)
// unless the server has NODE_ENV !== 'production' && DEV_LOGIN_ENABLED ===
// 'true', same gate as /auth/dev-login itself. Lets you switch identity —
// e.g. to a plain non-mod player — with one click instead of a console fetch.
function DevLoginPanel() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/auth/dev-users", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUsers(data?.users ?? null))
      .catch(() => setUsers(null));
  }, []);

  async function loginAs(discordId: string) {
    setPending(discordId);
    setError(null);
    try {
      const res = await fetch("/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ discordId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Dev login failed");
      }
      window.location.href = "/";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dev login failed");
      setPending(null);
    }
  }

  if (!users || users.length === 0) return null;

  // Admins first, then everyone else; each group keeps the server's name order (the sort is stable).
  const ordered = [...users].sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin));

  return (
    <div className="w-full border-t border-outline pt-5">
      <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-widest text-warn">Dev — log in as</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {ordered.map((u) => (
          <Button key={u.id} size="sm" onPress={() => loginAs(u.discordId)} isDisabled={pending === u.discordId}>
            {displayName(u)}
            {u.isAdmin && <span className="text-on-surface-subtle">admin</span>}
          </Button>
        ))}
      </div>
      {error && <p className="mt-3 text-center text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/");
  }, [user, loading, navigate]);

  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg border border-outline bg-surface px-8 py-10">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-on-surface">Tectonic Bingo</h1>
          <p className="mt-1 text-sm text-on-surface-muted">Sign in with the Discord account you use in the clan.</p>
        </div>
        {error && (
          <Notice tone="danger" icon={<AlertIcon />} className="w-full">
            Authentication failed. Please try again.
          </Notice>
        )}
        <a
          href="/auth/discord"
          className="inline-flex h-10 w-full items-center justify-center gap-2.5 rounded-md bg-[#5865F2] px-4 text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
        >
          <DiscordIcon />
          Continue with Discord
        </a>
        <p className="text-center text-xs text-on-surface-subtle">
          By continuing you agree to the{" "}
          <Link to="/terms" className="underline underline-offset-2 hover:text-on-surface">
            Terms of Service
          </Link>{" "}
          and have read the{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-on-surface">
            Privacy Policy
          </Link>
          .
        </p>
        <DevLoginPanel />
      </div>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

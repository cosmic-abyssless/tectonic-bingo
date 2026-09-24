import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { previewPhoneLoginLink, redeemPhoneLoginLink, type PhoneLoginAccount } from "../api/phoneLoginApi";
import { clearAuthCache } from "../api/authCache";
import { clearBoardCache } from "../api/boardCache";
import { Button } from "../core/ui/Button";
import { Notice } from "../core/ui/Card";
import { AlertIcon } from "../core/ui/icons";
import { avatarUrl, displayName } from "../core/ui/user";

/**
 * Where a phone lands from the "Log in on your phone" QR code (PhoneLoginDialog): who the code logs in as, and a
 * button to do it. It asks rather than logging straight in, so a link a preview or scanner app opens on its own
 * doesn't use it up. The token is in the #fragment; it's taken off the address as soon as it's read.
 */
export function PhoneLogin() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [account, setAccount] = useState<PhoneLoginAccount | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "This link is missing its login code. Scan the QR code again.");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    // Out of the address bar and history, so it isn't left lying around (it's single-use either way).
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!token) return;
    previewPhoneLoginLink(token)
      .then((r) => setAccount(r.user))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "This login code didn't work."));
  }, [token]);

  async function logIn() {
    setLoggingIn(true);
    try {
      await redeemPhoneLoginLink(token);
      // Whoever this browser was before (if anyone), their cached board and identity go.
      clearBoardCache();
      clearAuthCache();
      window.location.replace("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "This login code didn't work.");
      setAccount(null);
      setLoggingIn(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg border border-outline bg-surface px-8 py-10 text-center">
        <h1 className="text-xl font-semibold text-on-surface">Tectonic Bingo</h1>
        {error ? (
          <>
            <Notice tone="danger" icon={<AlertIcon />} className="w-full text-left">
              {error}
            </Notice>
            <Link to="/login" className="text-sm text-on-surface-muted underline underline-offset-2 hover:text-on-surface">
              Log in another way
            </Link>
          </>
        ) : account ? (
          <>
            <div className="flex flex-col items-center gap-3">
              <img src={avatarUrl(account)} alt="" className="size-16 rounded-full" />
              <p className="text-on-surface">
                Log in as <span className="font-semibold">{displayName(account)}</span>?
              </p>
            </div>
            <Button variant="primary" className="w-full" onPress={() => void logIn()} isDisabled={loggingIn}>
              {loggingIn ? "Logging in…" : "Log in"}
            </Button>
            <p className="text-xs text-on-surface-subtle">Only continue if you scanned this code from your own computer.</p>
          </>
        ) : (
          <p className="text-sm text-on-surface-muted">Checking your login code…</p>
        )}
      </div>
    </div>
  );
}

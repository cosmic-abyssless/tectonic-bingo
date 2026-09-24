import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPhoneLoginLink, getPhoneLoginLinkStatus, phoneLoginUrl, type PhoneLoginLinkStatus } from "../../api/phoneLoginApi";
import { Button } from "./Button";
import { Notice } from "./Card";
import { CheckIcon } from "./icons";
import { useDialogParts } from "./useDialogParts";

type Link = { id: string; url: string; expiresAt: number };

/**
 * Log in on your phone from here: a QR code of a one-time link to this account, which the phone's camera opens in
 * its own browser (no Discord web login, which wants a password most people only use the app for). It works once and
 * for a couple of minutes; the dialog watches for the phone to use it, and offers a new one when it runs out.
 */
export function PhoneLoginDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { Dialog, DialogHeader } = useDialogParts();
  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <DialogHeader title="Log in on your phone" onClose={onClose} />
      {/* Mounted only while open: opening makes a fresh link, closing lets it go. */}
      {isOpen && <PhoneLoginBody />}
    </Dialog>
  );
}

function PhoneLoginBody() {
  const [link, setLink] = useState<Link | null>(null);
  const [status, setStatus] = useState<PhoneLoginLinkStatus>("pending");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Each new link retires the last, so only the latest request's answer is shown (a slower earlier one is dead).
  const latest = useRef(0);

  async function makeLink() {
    const request = ++latest.current;
    setError(null);
    setLink(null);
    setStatus("pending");
    try {
      const made = await createPhoneLoginLink();
      if (request !== latest.current) return;
      const start = Date.now();
      setNow(start);
      setLink({ id: made.id, url: phoneLoginUrl(made.token), expiresAt: start + made.expiresInSeconds * 1000 });
    } catch {
      if (request === latest.current) setError("Couldn't make a login code. Try again.");
    }
  }

  useEffect(() => {
    void makeLink();
  }, []);

  // The countdown, and asking every couple of seconds whether the phone has used the link yet.
  useEffect(() => {
    if (!link || status !== "pending") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => {
      getPhoneLoginLinkStatus(link.id)
        .then((r) => setStatus(r.status))
        .catch(() => {});
    }, 2000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [link, status]);

  const secondsLeft = link ? Math.max(0, Math.ceil((link.expiresAt - now) / 1000)) : 0;
  const expired = status === "expired" || (status === "pending" && !!link && secondsLeft === 0);

  if (status === "used") {
    return (
      <div className="p-5">
        <Notice tone="ok" icon={<CheckIcon />}>
          You're logged in on your phone.
        </Notice>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-5 text-center">
      <p className="text-sm text-on-surface-muted">Scan this with your phone's camera to log in there as you, without Discord asking for your password.</p>
      {error ? (
        <Notice tone="danger" className="w-full">
          {error}
        </Notice>
      ) : (
        <div className={`rounded-md bg-qr-backdrop p-3 text-qr ${expired ? "opacity-15" : ""}`}>
          {link ? (
            <QRCodeSVG value={link.url} size={200} fgColor="currentColor" bgColor="transparent" title="Login QR code" />
          ) : (
            <div className="size-[200px]" aria-label="Making a login code" />
          )}
        </div>
      )}
      {expired || error ? (
        <Button variant="primary" size="sm" onPress={() => void makeLink()}>
          Show a new code
        </Button>
      ) : (
        link && (
          <p className="text-xs text-on-surface-subtle">
            Works once · expires in <span className="num">{`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`}</span>
          </p>
        )
      )}
      <p className="text-xs text-on-surface-subtle">Anyone who scans it logs in as you, so don't share it.</p>
    </div>
  );
}

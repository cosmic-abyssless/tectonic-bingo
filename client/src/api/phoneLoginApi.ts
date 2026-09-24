import { api } from "./client";

// Logging in on a phone from a browser that's already logged in (server: routes/auth.ts, services/phoneLoginService.ts).

export type PhoneLoginLinkStatus = "pending" | "used" | "expired";

/** Who a link logs in as, shown on the phone before it does. */
export interface PhoneLoginAccount {
  discordId: string;
  discordUsername: string;
  discordGlobalName: string | null;
  discordGuildNick: string | null;
  discordAvatar: string | null;
}

/** A new one-time link for this account (the last one stops working). The token is for the QR code only. */
export function createPhoneLoginLink() {
  return api.post<{ id: string; token: string; expiresInSeconds: number }>("/auth/phone-link");
}

export function getPhoneLoginLinkStatus(id: string) {
  return api.get<{ status: PhoneLoginLinkStatus }>(`/auth/phone-link/${encodeURIComponent(id)}`);
}

export function previewPhoneLoginLink(token: string) {
  return api.post<{ user: PhoneLoginAccount }>("/auth/phone-link/preview", { token });
}

export function redeemPhoneLoginLink(token: string) {
  return api.post<{ success: true }>("/auth/phone-link/redeem", { token });
}

/** The page on the phone the QR code opens. The token rides in the #fragment, which browsers never send to a server. */
export function phoneLoginUrl(token: string): string {
  return `${window.location.origin}/login/phone#${token}`;
}

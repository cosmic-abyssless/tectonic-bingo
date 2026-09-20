import { describe, expect, it } from "vitest";
import { LEGAL_CONTACT, LEGAL_UPDATED, PRIVACY_MD, TERMS_MD } from "./legalContent";

// The policy has to describe what the site really does. These pin the disclosures Discord's developer terms
// require (what is collected, who it is shared with, how to ask for deletion), so a rewrite can't drop one silently.
describe("privacy policy", () => {
  it("names the Discord permissions and what is stored from them", () => {
    for (const s of ["`identify`", "`guilds.members.read`", "Discord user ID", "username", "avatar", "nickname"]) expect(PRIVACY_MD).toContain(s);
    expect(PRIVACY_MD).toMatch(/don't keep the access token/);
  });

  it("names everyone the site sends information to", () => {
    for (const s of ["Discord", "Wise Old Man", "RuneProfile", "clan member service", "OSRS Wiki", "hosting provider", "Google Fonts"]) expect(PRIVACY_MD).toContain(s);
  });

  it("says how to ask for deletion, and covers cookies, retention, breaches and children", () => {
    for (const s of ["delete", "## Cookies and browser storage", "## How long we keep it", "without authorisation", "## Children", LEGAL_CONTACT]) expect(PRIVACY_MD).toContain(s);
  });
});

describe("both documents", () => {
  it("are dated and link to each other", () => {
    for (const doc of [TERMS_MD, PRIVACY_MD]) expect(doc).toContain(`Last updated: ${LEGAL_UPDATED}`);
    expect(TERMS_MD).toContain("](/privacy)");
    expect(PRIVACY_MD).toContain("](/terms)");
  });

  it("send people to Discord's own terms and don't claim Discord's endorsement", () => {
    expect(TERMS_MD).toContain("discord.com/terms");
    expect(TERMS_MD).toMatch(/not affiliated with, endorsed by, or sponsored by[^.]*Discord/);
  });
});

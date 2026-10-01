// The Bingo's Wrapped art (CONTEXT.md "Wrapped art"), uploaded by the Admin through the Wrapped art manager's endpoints
// as placeholder cut-outs: Player card art (#396), best first, so the share cards' ranked art shows; and the Team
// section's Category images, so the Team card's art shows too. A group the new Bingo already has art in (copied from
// the previous Bingo on this server) is left as it is, as an Admin happy with last time's would.
import sharp from "sharp";
import type { WrappedArtGroup, WrappedArtImage } from "@bingo/shared";
import type { Api } from "./client";

/** Player card art, best first: gold, silver, bronze, then everyone else. */
const PLAYER_CARD_COLORS = ["#f5c518", "#c0c7d0", "#cd7f32", "#7b8794"];
/** The Team section's three: a Team's worth of different characters. */
const TEAM_COLORS = ["#e4572e", "#29a19c", "#6c5ce7"];

/** A transparent PNG of a simple character in `color`, a star on its chest for ranked art: no keying needed. */
export function placeholderArt(color: string, star: boolean): Promise<Buffer> {
  const ink = "#1b1b1b";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360" viewBox="0 0 240 360">
  <rect x="50" y="130" width="140" height="200" rx="40" fill="${color}" stroke="${ink}" stroke-width="8"/>
  <circle cx="120" cy="80" r="56" fill="${color}" stroke="${ink}" stroke-width="8"/>
  <circle cx="98" cy="74" r="8" fill="${ink}"/><circle cx="142" cy="74" r="8" fill="${ink}"/>
  ${star ? `<polygon points="120,170 131,198 161,198 137,216 146,245 120,228 94,245 103,216 79,198 109,198" fill="#fff" stroke="${ink}" stroke-width="5"/>` : ""}
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export interface WrappedArtInput {
  api: Api;
  adminDiscordId: string;
  slug: string;
  at: Date;
  log(message: string): void;
}

/** Fills the Player card art and the Team section's Category images, each only when it's empty. */
export async function uploadWrappedArt({ api, adminDiscordId, slug, at, log }: WrappedArtInput): Promise<void> {
  const admin = api.as(adminDiscordId);
  const base = `/api/bingos/${slug}/admin/wrapped-art`;
  const { art } = await admin.get<{ art: WrappedArtImage[] }>(base, { at });
  const fill = async (group: WrappedArtGroup, colors: string[], star: boolean) => {
    if (art.some((a) => a.group === group)) return log(`Wrapped art: kept the ${art.filter((a) => a.group === group).length} ${group} images copied from the previous Bingo`);
    for (const color of colors) await admin.upload(`${base}/${group}`, "image", await placeholderArt(color, star), "art.png", { at });
    log(`Wrapped art: uploaded ${colors.length} placeholder ${group} images`);
  };
  await fill("playerCard", PLAYER_CARD_COLORS, true);
  await fill("team", TEAM_COLORS, false);
}

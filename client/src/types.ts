export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  verified?: boolean;
  global_name?: string | null;
  team: string | null;
}

export function avatarUrl(user: DiscordUser): string {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  }
  // Default Discord avatar based on discriminator or ID
  const index =
    user.discriminator === "0"
      ? Number(BigInt(user.id) >> 22n) % 6
      : parseInt(user.discriminator) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

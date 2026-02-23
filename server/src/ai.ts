import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

/** Returns the Anthropic client, or null if ANTHROPIC_API_KEY is not set. */
export function getAIClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

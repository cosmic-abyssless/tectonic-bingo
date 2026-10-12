import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { MinimalUser, SubmissionReactionGroup, TeamSubmissionsResponse } from "@bingo/shared";
import { applyReactionChanges, REACTION_MUTATION_KEY, toggleReaction, withReactions } from "./reactionsCache";

const ann = { id: "ann", discordUsername: "ann", discordGlobalName: null, discordGuildNick: null, rsn: null } as MinimalUser;
const bob = { ...ann, id: "bob", discordUsername: "bob" } as MinimalUser;
const fire = (...users: MinimalUser[]): SubmissionReactionGroup[] => [{ emoji: "🔥", users }];

function list(...ids: string[]): TeamSubmissionsResponse {
  return { submissions: ids.map((id) => ({ submission: { id }, reactions: [] })) } as unknown as TeamSubmissionsResponse;
}
const reactionsOf = (data: TeamSubmissionsResponse | undefined) => Object.fromEntries((data?.submissions ?? []).map((s) => [s.submission.id, s.reactions]));

describe("toggleReaction", () => {
  it("puts the viewer on or takes them off, keeping the emojis in order", () => {
    expect(toggleReaction(fire(bob), "🔥", ann, true)).toEqual(fire(bob, ann));
    expect(toggleReaction(fire(bob, ann), "🔥", ann, false)).toEqual(fire(bob));
    expect(toggleReaction(fire(ann), "🔥", ann, false)).toEqual([]);
    expect(toggleReaction(fire(ann), "🎉", bob, true).map((g) => g.emoji)).toEqual(["🔥", "🎉"]);
  });
});

describe("withReactions", () => {
  it("puts in the changed submissions' reactions and leaves the rest", () => {
    const before = list("s1", "s2");
    const after = withReactions(before, [{ submissionId: "s2", reactions: fire(ann) }]);
    expect(reactionsOf(after)).toEqual({ s1: [], s2: fire(ann) });
    expect(after.submissions[0]).toBe(before.submissions[0]);
  });

  it("is the same list when none of its submissions changed", () => {
    const before = list("s1");
    expect(withReactions(before, [{ submissionId: "other", reactions: fire(ann) }])).toBe(before);
  });
});

describe("applyReactionChanges", () => {
  it("puts them into every cached list of that Team, and no other Team's", () => {
    const client = new QueryClient();
    client.setQueryData(["teamSubmissions", "bingo", "t1"], list("s1"));
    client.setQueryData(["teamSubmissions", "bingo", "t2"], list("s1"));
    applyReactionChanges(client, "t1", [{ submissionId: "s1", reactions: fire(bob) }]);
    expect(reactionsOf(client.getQueryData(["teamSubmissions", "bingo", "t1"]))).toEqual({ s1: fire(bob) });
    expect(reactionsOf(client.getQueryData(["teamSubmissions", "bingo", "t2"]))).toEqual({ s1: [] });
  });

  it("leaves a submission this tab is still reacting to as the tab shows it", async () => {
    const client = new QueryClient();
    client.setQueryData(["teamSubmissions", "bingo", "t1"], list("s1", "s2"));
    let answer!: () => void;
    const reacting = client
      .getMutationCache()
      .build(client, { mutationKey: REACTION_MUTATION_KEY, mutationFn: () => new Promise<void>((resolve) => (answer = resolve)) })
      .execute({ submissionId: "s1" });
    applyReactionChanges(client, "t1", [
      { submissionId: "s1", reactions: fire(bob) },
      { submissionId: "s2", reactions: fire(bob) },
    ]);
    expect(reactionsOf(client.getQueryData(["teamSubmissions", "bingo", "t1"]))).toEqual({ s1: [], s2: fire(bob) });
    // The request starts a tick later; let it, then answer it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    answer();
    await reacting;
  });
});

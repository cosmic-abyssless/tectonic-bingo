import { afterEach, describe, expect, it, vi } from "vitest";
import { getGenerateJob, isGenerateJobRunning, jobView, startGenerateJob } from "./job";
import { normalizeOptions } from "./options";
import type { RunInput } from "./run";

// The run itself is the generator (tested in generator.test.ts, and end to end by running it); here only the job
// around it: one at a time, its log, and how it ends.
const runs: { input: RunInput; finish(problems?: string[]): void; fail(err: Error): void }[] = [];
vi.mock("./run", () => ({
  runGenerate: (input: RunInput) =>
    new Promise((resolve, reject) => {
      runs.push({ input, finish: (problems = []) => resolve({ slug: input.options.slug, problems }), fail: reject });
    }),
}));


const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const params = (slug: string) => ({
  options: normalizeOptions({ slug }),
  board: { kind: "bingo" as const, slug: "tectonic-comics-bingo" },
  adminDiscordId: "admin-1",
  startedBy: "admin",
});

afterEach(async () => {
  for (const run of runs.splice(0)) run.finish();
  await flush();
  vi.unstubAllEnvs();
});

describe("the test data job", () => {
  it("runs one at a time, against this server over loopback, as the admin who started it", async () => {
    vi.stubEnv("PORT", "4321");
    const job = startGenerateJob(params("testdata-one"));
    expect(job).toMatchObject({ status: "running", slug: "testdata-one", boardFrom: "tectonic-comics-bingo", startedBy: "admin" });
    expect(isGenerateJobRunning()).toBe(true);
    expect(() => startGenerateJob(params("testdata-two"))).toThrow(/already in progress/);

    const { input } = runs[0]!;
    expect(input.api.base).toBe("http://127.0.0.1:4321");
    expect(input.api.headers).toEqual({ "X-Forwarded-Proto": "https" });
    expect(input.adminDiscordId).toBe("admin-1");
  });

  it("keeps the log, hands out only the new lines, and finishes", async () => {
    startGenerateJob(params("testdata-log"));
    const run = runs[0]!;
    run.input.log("first");
    run.input.log("second");
    const job = getGenerateJob()!;
    expect(jobView(job, 1).log.map((l) => l.message)).toEqual(["second"]);

    run.finish(["a sanity problem"]);
    await flush();
    expect(getGenerateJob()).toMatchObject({ status: "done", problems: ["a sanity problem"] });
    expect(getGenerateJob()!.finishedAt).not.toBeNull();
    expect(getGenerateJob()!.log.at(-1)!.message).toBe("done: /b/testdata-log");
    expect(isGenerateJobRunning()).toBe(false);
  });

  it("reports a failed run, and lets the next one start", async () => {
    startGenerateJob(params("testdata-fail"));
    runs[0]!.fail(new Error("POST /api/admin/bingos/import -> 400: bad document"));
    await flush();
    expect(getGenerateJob()).toMatchObject({ status: "failed", error: "POST /api/admin/bingos/import -> 400: bad document" });
    runs.splice(0);
    expect(() => startGenerateJob(params("testdata-next"))).not.toThrow();
  });
});

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { TEST_DATA_STAGES, STAGE_LABEL, type TestDataBingo, type TestDataJob, type TestDataStage } from "@bingo/shared";
import { useAuth } from "../../context/AuthContext";
import { queryKeys, useBingos } from "../../api/queries";
import * as devApi from "../../api/devApi";
import { devQueryKeys, useGenerateJob, useTestBingos } from "../../api/devApi";
import { Button } from "../ui/Button";
import { Badge, Notice } from "../ui/Card";
import { Field, Input, Select } from "../ui/Field";
import { Switch } from "../ui/Switch";

// The test data generator, started from the browser: it runs inside the server (docs/generate-bingo.md), so this works
// the same on a local dev server and on staging. Only shown while the server is in dev mode.

const TESTDATA_PREFIX = "testdata-";

function GenerateForm({ running, onStarted }: { running: boolean; onStarted: () => void }) {
  const { user } = useAuth();
  const { data } = useBingos();
  const sources = (data?.bingos ?? []).filter((b) => !b.slug.startsWith(TESTDATA_PREFIX));
  const [from, setFrom] = useState("");
  const [stage, setStage] = useState<TestDataStage>("live");
  const [progressPct, setProgressPct] = useState(50);
  const [days, setDays] = useState(9);
  const [teams, setTeams] = useState(6);
  const [teamSize, setTeamSize] = useState(14);
  const [mods, setMods] = useState(3);
  const [seed, setSeed] = useState("");
  const [joinAsMe, setJoinAsMe] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source = from || sources[0]?.slug || "";

  async function start() {
    setStarting(true);
    setError(null);
    try {
      await devApi.startGenerate({
        from: source,
        stage,
        progress: progressPct / 100,
        days,
        teams,
        teamSize,
        mods,
        me: joinAsMe && user ? user.discordId : null,
        ...(seed.trim() ? { seed: Number(seed) } : {}),
      });
      onStarted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't start the run");
    } finally {
      setStarting(false);
    }
  }

  if (sources.length === 0) {
    return <Notice tone="info">There's no bingo on this server to copy a board from. Import one first (Bingos &gt; Import).</Notice>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Copy the board of" hint="Its tiles, lines, rules and signup questions. Nothing else is copied.">
          <Select value={source} onChange={(e) => setFrom(e.target.value)}>
            {sources.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name} ({b.slug})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Leave it at" hint={stage === "draft" ? "Halfway through the draft." : undefined}>
          <Select value={stage} onChange={(e) => setStage(e.target.value as TestDataStage)}>
            {TEST_DATA_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        {stage === "live" && (
          <Field label="How far through the event (%)">
            <Input type="number" min={2} max={100} value={progressPct} onChange={(e) => setProgressPct(Number(e.target.value))} className="num" />
          </Field>
        )}
        <Field label="Event length (days)">
          <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className="num" />
        </Field>
        <Field label="Teams">
          <Input type="number" min={2} max={12} value={teams} onChange={(e) => setTeams(Number(e.target.value))} className="num" />
        </Field>
        <Field label="Players per team">
          <Input type="number" min={2} max={30} value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} className="num" />
        </Field>
        <Field label="Mods (besides you)">
          <Input type="number" min={1} max={10} value={mods} onChange={(e) => setMods(Number(e.target.value))} className="num" />
        </Field>
        <Field label="Seed" hint="Optional. The same seed and settings make the same bingo.">
          <Input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))} placeholder="random" className="num" />
        </Field>
      </div>
      <div>
        <Switch isSelected={joinAsMe} onChange={setJoinAsMe}>
          Put me on a team (you sign up, get drafted and are made a mod)
        </Switch>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      <div>
        <Button variant="primary" onPress={start} isDisabled={running || starting || !source}>
          {starting ? "Starting…" : running ? "A run is in progress" : "Generate"}
        </Button>
      </div>
    </div>
  );
}

const STATUS_TONE = { running: "info", done: "ok", failed: "danger" } as const;

/** `exists`: the run's bingo is still on the server (not torn down since), so there's something to open. */
function JobStatus({ job, exists }: { job: TestDataJob; exists: boolean }) {
  const logRef = useRef<HTMLPreElement>(null);
  // Follow the log as it grows, like a terminal.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job.logCount]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={STATUS_TONE[job.status]}>{job.status === "running" ? "Running" : job.status === "done" ? "Done" : "Failed"}</Badge>
        <span className="font-mono text-on-surface">{job.slug}</span>
        <span className="text-on-surface-muted">
          · {STAGE_LABEL[job.options.stage]} · board from {job.boardFrom} · seed {job.options.seed} · started by {job.startedBy}
        </span>
        {job.status === "done" && exists && (
          <Link to={`/b/${job.slug}`} className="font-medium text-accent underline">
            Open it
          </Link>
        )}
      </div>
      {job.error && <Notice tone="danger">{job.error}</Notice>}
      {job.problems.length > 0 && <Notice tone="warn">Sanity checks failed (a generator bug, not the app's): {job.problems.join("; ")}</Notice>}
      <pre ref={logRef} className="max-h-80 overflow-auto rounded-md border border-outline bg-surface-raised p-3 font-mono text-xs leading-relaxed text-on-surface-muted">
        {job.log.map((l) => l.message).join("\n")}
      </pre>
    </div>
  );
}

function TestBingoRow({ bingo, busy }: { bingo: TestDataBingo; busy: boolean }) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function tearDown() {
    if (!confirm(`Tear down ${bingo.slug}? The bingo, its uploads and its test users are deleted.`)) return;
    setRemoving(true);
    setError(null);
    try {
      await devApi.tearDownTestBingo(bingo.slug);
      await Promise.all([queryClient.invalidateQueries({ queryKey: devQueryKeys.testBingos }), queryClient.invalidateQueries({ queryKey: queryKeys.bingos() })]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to tear it down");
      setRemoving(false);
    }
  }

  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/b/${bingo.slug}`} className="font-mono text-sm font-semibold text-on-surface hover:underline">
            {bingo.slug}
          </Link>
          <div className="text-xs text-on-surface-muted">
            {/* Its created date is backdated with the rest of its history, so it's shown as that, not as when it was made. */}
            {STAGE_LABEL[bingo.stage as TestDataStage] ?? bingo.stage} · history from {new Date(bingo.createdAt).toLocaleDateString()}
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-danger shrink-0" onPress={tearDown} isDisabled={removing || busy}>
          {removing ? "Tearing down…" : "Tear down"}
        </Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </li>
  );
}

export function TestDataPanel() {
  const queryClient = useQueryClient();
  const { data: jobData } = useGenerateJob(true);
  const { data: bingosData, isLoading } = useTestBingos(true);
  const job = jobData?.job ?? null;
  const running = job?.status === "running";

  // When a run ends, its bingo joins the lists.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) {
      void queryClient.invalidateQueries({ queryKey: devQueryKeys.testBingos });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bingos() });
    }
    wasRunning.current = running;
  }, [running, queryClient]);

  const testBingos = bingosData?.bingos ?? [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-on-surface-muted">
        Makes a realistic practice bingo: made-up players sign up, captains draft, teams play and mods review, all through the real site, with the
        times spread over days. It takes a minute or two. Generated bingos start with <span className="font-mono">testdata-</span>; tear them down
        when you're done.
      </p>
      <GenerateForm running={running} onStarted={() => void queryClient.invalidateQueries({ queryKey: devQueryKeys.generateJob })} />
      {job && <JobStatus job={job} exists={testBingos.some((b) => b.slug === job.slug)} />}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-on-surface">Generated bingos</h3>
        {isLoading ? (
          <p className="text-sm text-on-surface-muted">Loading…</p>
        ) : testBingos.length === 0 ? (
          <p className="text-sm text-on-surface-subtle">None yet.</p>
        ) : (
          <ul className="divide-y divide-outline rounded-md border border-outline">
            {testBingos.map((b) => (
              <TestBingoRow key={b.id} bingo={b} busy={running && job?.slug === b.slug} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

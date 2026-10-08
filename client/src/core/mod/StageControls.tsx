import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { STAGE_LABEL, STAGE_ORDER, nextMilestone, type Bingo, type Stage } from "@bingo/shared";
import { ApiError } from "../../api/client";
import * as adminApi from "../../api/adminApi";
import { adminQueryKeys } from "../../api/adminQueries";
import { cutReviewQuery, useAdvanceStage, useCutReview, useDraftCuts } from "../../api/queries";
import { cutModeLabel, describeShares } from "../draft/cutModes";
import { useDialogParts } from "../ui/useDialogParts";
import { Button } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { MilestoneCountdown, StageStepper } from "../ui/StageStepper";
import { ArrowLeftIcon, ArrowRightIcon } from "../ui/icons";
import { formatDuration, formatLocalDateTime } from "../ui/time";
import { CutReviewModal } from "./CutReviewModal";
import { TextButton } from "../ui/TextButton";

// What advancing *into* each stage does, so a mod knows before confirming.
const ENTER_EFFECT: Record<Stage, string> = {
  planning: "Signups close; the board becomes editable again.",
  signup: "Players can sign up and edit their answers. New signups are gated on clan membership. Captains can be picked from the Captains tab as signups come in.",
  captains: "Signups close and the roster is final. Captains keep scouting, and every player can look through the signups, until the draft starts.",
  draft: "Captains can enter the draft room. Start the draft from there once everyone is present.",
  reveal: "Teams and the board become visible to players. The board locks for editing.",
  live: "Submissions open. If no start date is set, the bingo starts now.",
  complete: "Submissions close; the board and stats stay visible.",
};

/** The stage and what is next. Only site admins can change it: for anyone else there are no buttons, just the read-out. */
export function StageControls({ slug, bingo, canChange }: { slug: string; bingo: Bingo; canChange: boolean }) {
  const { Dialog, DialogHeader } = useDialogParts();
  const advanceStage = useAdvanceStage(slug);
  const [confirming, setConfirming] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cuts = useDraftCuts(slug, confirming === "draft");
  const queryClient = useQueryClient();
  // The Cut review (CONTEXT.md "Cut review") stands between an Admin and the Draft while any cut is avoidable: it
  // opens first, and once it's applied (even as "keep these cuts") the confirmation below follows.
  const [reviewingCuts, setReviewingCuts] = useState(false);
  const cutReview = useCutReview(slug, confirming === "draft");
  // Moving into the draft with anyone to cut: the button says so.
  const cutPlayers = confirming === "draft" && cuts.data?.shares ? cuts.data.cut.reduce((n, c) => n + c.names.length, 0) : 0;

  // Live always means started (CONTEXT.md "Stage"): with the start date still ahead, the Bingo goes Live by itself
  // then, and going Live sooner is starting now, which moves the start date to that moment.
  // Only before Live: a Finished Bingo has started already. This browser's clock can disagree with the server's by a
  // few seconds around the start date; the server's word (start_date_ahead, in go()) settles it.
  const [serverSaysAhead, setServerSaysAhead] = useState(false);
  const startsAt = bingo.startsAt ? new Date(bingo.startsAt).getTime() : null;
  const beforeLive = STAGE_ORDER.indexOf(bingo.stage) < STAGE_ORDER.indexOf("live");
  const startAhead = beforeLive && startsAt !== null && (startsAt > Date.now() || serverSaysAhead);
  const startingEarly = confirming === "live" && startAhead;

  const idx = STAGE_ORDER.indexOf(bingo.stage);
  const nextStage = idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  const prevStage = idx > 0 ? STAGE_ORDER[idx - 1] : null;

  // Stages strictly between the current one and the target, in travel order.
  const skipped = confirming ? STAGE_ORDER.slice(Math.min(idx, STAGE_ORDER.indexOf(confirming)) + 1, Math.max(idx, STAGE_ORDER.indexOf(confirming))) : [];

  // Asking to move into the Draft with Avoidable cuts, and no review applied since the roster last changed, goes
  // through the Cut review first; anything else, straight to the confirmation. If the plan can't be worked out, the
  // confirmation still opens (the server guards the move).
  async function request(toStage: Stage) {
    setError(null);
    if (toStage === "draft" && idx < STAGE_ORDER.indexOf("draft")) {
      // A duo bingo's Teams have to be led by pairs before anything else (the server refuses the move otherwise): say
      // so up front, rather than after a Cut review worked out for Teams that are about to change.
      if (bingo.signupMode === "duo") {
        const candidates = await queryClient
          .fetchQuery({ queryKey: adminQueryKeys.captainCandidates(slug), queryFn: () => adminApi.getCaptainCandidates(slug) })
          .catch(() => null);
        const count = candidates?.teamsNotLedByPairs.length ?? 0;
        if (count > 0) {
          setError(`In a duo bingo every Team is led by a pair. ${count === 1 ? "1 Team isn't" : `${count} Teams aren't`}: fix ${count === 1 ? "it" : "them"} on the Captains tab first.`);
          return;
        }
      }
      const preview = await queryClient.fetchQuery(cutReviewQuery(slug)).catch(() => null);
      if (preview && preview.avoidableCount > 0 && !preview.reviewed) {
        setReviewingCuts(true);
        return;
      }
    }
    setConfirming(toStage);
  }

  async function go(toStage: Stage) {
    setError(null);
    try {
      await advanceStage.mutateAsync({ toStage, startNow: toStage === "live" && startAhead });
      setConfirming(null);
      setServerSaysAhead(false);
    } catch (e: unknown) {
      // Started early after all, on the server's clock: the confirmation turns into Start now's, to confirm again.
      if (e instanceof ApiError && e.code === "start_date_ahead") {
        setServerSaysAhead(true);
        return;
      }
      // The roster changed since the last review (or none was applied): review the cuts, then confirm again.
      if (e instanceof ApiError && e.code === "cut_review_required") {
        setConfirming(null);
        setReviewingCuts(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to change stage");
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-on-surface-subtle">Current stage</p>
          <p className="text-lg font-semibold text-on-surface">{STAGE_LABEL[bingo.stage]}</p>
        </div>
        <div className="flex gap-2">
          {canChange && prevStage && (
            <Button size="sm" onPress={() => request(prevStage)}>
              <ArrowLeftIcon />
              Back to {STAGE_LABEL[prevStage]}
            </Button>
          )}
          {canChange && nextStage && (
            <Button size="sm" variant="primary" onPress={() => request(nextStage)}>
              {nextStage === "live" && startAhead ? "Start now" : `Advance to ${STAGE_LABEL[nextStage]}`}
              <ArrowRightIcon />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StageStepper stage={bingo.stage} onSelect={canChange ? request : undefined} />
        <MilestoneCountdown milestone={nextMilestone(bingo)} />
      </div>

      {bingo.stage === "reveal" && startAhead && (
        <p className="text-sm text-on-surface-muted">
          It goes Live by itself at the start date.{canChange && " Start now to begin sooner."}
        </p>
      )}

      {error && !confirming && <Notice tone="danger">{error}</Notice>}


      {/* A stage change asks first, in a dialog: what the new stage does, and (into the draft) exactly who's cut. */}
      <Dialog
        isOpen={canChange && !!confirming}
        onClose={() => {
          setConfirming(null);
          setError(null);
        }}
      >
        {confirming && (
          <>
            <DialogHeader
              title={startingEarly ? "Start the bingo now?" : `Move to ${STAGE_LABEL[confirming]}?`}
              subtitle={`From ${STAGE_LABEL[bingo.stage]}`}
              onClose={() => setConfirming(null)}
            />
            <div className="space-y-3 p-5 text-sm">
              {startingEarly ? <StartEarlyEffects startsAt={startsAt!} endsAt={bingo.endsAt ? new Date(bingo.endsAt).getTime() : null} fromReveal={bingo.stage === "reveal"} /> : <p className="text-on-surface-muted">{ENTER_EFFECT[confirming]}</p>}
              {skipped.length > 0 && <p className="text-on-surface-muted">Skips {skipped.map((s) => STAGE_LABEL[s]).join(", ")}.</p>}
              {confirming === "draft" && (
                <DraftCutsPreview
                  cuts={cuts}
                  bingo={bingo}
                  someAvoidable={(cutReview.data?.avoidableCount ?? 0) > 0}
                  onReviewCuts={() => {
                    setConfirming(null);
                    setReviewingCuts(true);
                  }}
                />
              )}
              {error && <Notice tone="danger">{error}</Notice>}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onPress={() => setConfirming(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant={cutPlayers > 0 ? "danger" : "primary"} onPress={() => go(confirming)} isDisabled={advanceStage.isPending}>
                  {cutPlayers > 0 ? `Cut ${cutPlayers} and move to ${STAGE_LABEL[confirming]}` : startingEarly ? "Start now" : "Confirm"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>

      {canChange && (
        <CutReviewModal
          slug={slug}
          isOpen={reviewingCuts}
          onClose={() => setReviewingCuts(false)}
          onApplied={() => {
            setReviewingCuts(false);
            setConfirming("draft");
          }}
        />
      )}
    </Card>
  );
}

/** What starting ahead of the start date does, said before it's done: it can't be put back to the old start date. */
function StartEarlyEffects({ startsAt, endsAt, fromReveal }: { startsAt: number; endsAt: number | null; fromReveal: boolean }) {
  return (
    <div className="space-y-2 text-on-surface-muted">
      <p>
        The bingo is set to start <span className="text-on-surface">{formatLocalDateTime(startsAt)}</span> (
        {startsAt > Date.now() ? `in ${formatDuration(startsAt - Date.now())}` : "any moment now"}), your local time.
        {fromReveal ? " It goes Live by itself then, so there's nothing you need to do." : " From Board revealed, it goes Live by itself then."}
      </p>
      <p>Starting it now instead:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Moves the start date to now,</strong> the moment you confirm. The old start date isn't kept.
        </li>
        <li>Opens Submissions straight away, and starts Tile freezes from now.</li>
        <li>Moves the Wise Old Man competition's start to now.</li>
        <li>Ends the countdown players are watching on the Board early.</li>
      </ul>
      {endsAt !== null && (
        <p>
          The end date stays <span className="text-on-surface">{formatLocalDateTime(endsAt)}</span>.
        </p>
      )}
    </div>
  );
}

/**
 * Before moving into the draft: what every team drafts, and who confirming will cut (newest first), from the bingo's
 * draft cuts setting. Unlike everywhere else (where mods still have time to change it), said plainly: this is the step
 * that cuts them.
 */
function DraftCutsPreview({
  cuts,
  bingo,
  someAvoidable,
  onReviewCuts,
}: {
  cuts: ReturnType<typeof useDraftCuts>;
  bingo: Bingo;
  someAvoidable: boolean;
  onReviewCuts: () => void;
}) {
  const { data, isLoading, error } = cuts;
  if (isLoading) return <p className="text-on-surface-subtle">Working out who's cut…</p>;
  if (error || !data) return <Notice tone="danger">Couldn't work out who's cut.</Notice>;
  const mode = cutModeLabel(data.cutMode, bingo.signupMode);
  if (data.cutMode === "none") {
    return <Notice tone="neutral">{mode}: everyone will be drafted and nobody will be cut. Teams may end up different sizes.</Notice>;
  }
  if (!data.shares) {
    return <Notice tone="warn">There are fewer than two teams, so nobody would be cut. Add the captains first to see who will be.</Notice>;
  }
  const players = data.cut.reduce((n, c) => n + c.names.length, 0);
  return (
    <div className="space-y-2">
      <p className="text-on-surface">
        {mode}: each of the <span className="num">{data.teamCount}</span> teams will draft {describeShares(data.shares, bingo.signupMode)}.
      </p>
      {data.cut.length === 0 ? (
        <Notice tone="ok">Nobody will be cut.</Notice>
      ) : (
        <Notice tone="danger">
          <p className="font-medium text-on-surface">
            Confirming cuts {players === 1 ? "this signup" : <>these <span className="num">{players}</span> signups</>} from the draft. They won't be drafted
            onto any team:
          </p>
          <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto">
            {data.cut.map((c) => (
              <li key={c.names.join("+")}>
                {c.names.join(" & ")}
                {c.pair && <span className="text-on-surface-subtle"> (pair)</span>}
              </li>
            ))}
          </ul>
          {/* Still avoidable after a review that kept these cuts: the review can be run again from here. */}
          {someAvoidable && (
            <p className="mt-2">
              <strong>Some cuts can be avoided.</strong>{" "}
              <TextButton onPress={onReviewCuts} className="font-medium text-on-surface">
                Review cuts
              </TextButton>
            </p>
          )}
        </Notice>
      )}
    </div>
  );
}

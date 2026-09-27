import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { STAGE_LABEL, STAGE_ORDER, areTilesSealed, isBoardLocked, nextMilestone, type Bingo, type Stage } from "@bingo/shared";
import * as adminApi from "../../api/adminApi";
import { queryKeys, useAdvanceStage, useDraftCuts } from "../../api/queries";
import { cutModeLabel, describeShares } from "../draft/cutModes";
import { useDialogParts } from "../ui/useDialogParts";
import { Button } from "../ui/Button";
import { Card, Notice } from "../ui/Card";
import { MilestoneCountdown, StageStepper } from "../ui/StageStepper";
import { Switch } from "../ui/Switch";
import { ArrowLeftIcon, ArrowRightIcon } from "../ui/icons";

// What advancing *into* each stage does, so a mod knows before confirming.
const ENTER_EFFECT: Record<Stage, string> = {
  planning: "Signups close; the board becomes editable again.",
  signup: "Players can sign up and edit their answers. New signups are gated on clan membership. Captains can be picked from the Captains tab as signups come in.",
  captains: "Signups close and the roster is final. Captains can keep scouting until the draft starts.",
  draft: "Captains can enter the draft room. Start the draft from there once everyone is present.",
  reveal: "Teams and the board become visible to players. The board locks for editing.",
  live: "Submissions open. If no start time is set, the bingo starts now.",
  complete: "Submissions close; the board and stats stay visible.",
};

/** The stage and what is next. Only site admins can change it: for anyone else there are no buttons, just the read-out. */
export function StageControls({ slug, bingo, canChange }: { slug: string; bingo: Bingo; canChange: boolean }) {
  const { Dialog, DialogHeader } = useDialogParts();
  const advanceStage = useAdvanceStage(slug);
  const [confirming, setConfirming] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cuts = useDraftCuts(slug, confirming === "draft");
  // Moving into the draft with anyone to cut: the button says so.
  const cutPlayers = confirming === "draft" && cuts.data?.shares ? cuts.data.cut.reduce((n, c) => n + c.names.length, 0) : 0;

  const idx = STAGE_ORDER.indexOf(bingo.stage);
  const nextStage = idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  const prevStage = idx > 0 ? STAGE_ORDER[idx - 1] : null;

  // Stages strictly between the current one and the target, in travel order.
  const skipped = confirming ? STAGE_ORDER.slice(Math.min(idx, STAGE_ORDER.indexOf(confirming)) + 1, Math.max(idx, STAGE_ORDER.indexOf(confirming))) : [];

  async function go(toStage: Stage) {
    setError(null);
    try {
      await advanceStage.mutateAsync(toStage);
      setConfirming(null);
    } catch (e: unknown) {
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
            <Button size="sm" onPress={() => setConfirming(prevStage)}>
              <ArrowLeftIcon />
              Back to {STAGE_LABEL[prevStage]}
            </Button>
          )}
          {canChange && nextStage && (
            <Button size="sm" variant="primary" onPress={() => setConfirming(nextStage)}>
              Advance to {STAGE_LABEL[nextStage]}
              <ArrowRightIcon />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StageStepper stage={bingo.stage} onSelect={canChange ? setConfirming : undefined} />
        <MilestoneCountdown milestone={nextMilestone(bingo)} />
      </div>

      {error && !confirming && <Notice tone="danger">{error}</Notice>}

      <RevealOptions slug={slug} bingo={bingo} canChange={canChange} />

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
            <DialogHeader title={`Move to ${STAGE_LABEL[confirming]}?`} subtitle={`From ${STAGE_LABEL[bingo.stage]}`} onClose={() => setConfirming(null)} />
            <div className="space-y-3 p-5 text-sm">
              <p className="text-on-surface-muted">{ENTER_EFFECT[confirming]}</p>
              {skipped.length > 0 && <p className="text-on-surface-muted">Skips {skipped.map((s) => STAGE_LABEL[s]).join(", ")}.</p>}
              {confirming === "draft" && <DraftCutsPreview cuts={cuts} bingo={bingo} />}
              {error && <Notice tone="danger">{error}</Notice>}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onPress={() => setConfirming(null)}>
                  Cancel
                </Button>
                <Button size="sm" variant={cutPlayers > 0 ? "danger" : "primary"} onPress={() => go(confirming)} isDisabled={advanceStage.isPending}>
                  {cutPlayers > 0 ? `Cut ${cutPlayers} and move to ${STAGE_LABEL[confirming]}` : "Confirm"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>
    </Card>
  );
}

/** Where the board's sealed notice links to (see BoardPageLayout): the switches below, at the top of the mod panel. */
export const REVEAL_OPTIONS_ID = "reveal-options";

/**
 * What players get during Board revealed: Sealed Tiles and Hide rules (CONTEXT.md "Sealed Tiles"). Both only apply
 * during Board revealed and end by themselves at Live, so they're offered up to then. A switch saves at once and
 * connected viewers pick it up through the settings broadcast.
 */
function RevealOptions({ slug, bingo, canChange }: { slug: string; bingo: Bingo; canChange: boolean }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (isBoardLocked(bingo.stage)) return null;

  async function save(change: Pick<Partial<Bingo>, "sealedTiles" | "hideRules">) {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateBingoSettings(slug, change);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bingo(slug) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inReveal = bingo.stage === "reveal";
  return (
    <div id={REVEAL_OPTIONS_ID} className="space-y-2 border-t border-outline pt-3">
      <p className="text-xs uppercase tracking-wide text-on-surface-subtle">During {STAGE_LABEL.reveal}</p>
      <div className="space-y-1">
        <Switch isSelected={bingo.sealedTiles} onChange={(sealedTiles) => save({ sealedTiles })} isDisabled={!canChange || saving}>
          Seal the Tiles
        </Switch>
        <p className="pl-11 text-xs text-on-surface-subtle">
          Players and Captains see each Tile's art, name and Category, but can't open it, see its points or mark interest, until you unseal the Tiles or the bingo goes {STAGE_LABEL.live}.
          Moderators can still open everything.
          {inReveal && (areTilesSealed(bingo) ? " The Tiles are sealed now." : " The Tiles are open now.")}
        </p>
      </div>
      <div className="space-y-1">
        <Switch isSelected={bingo.hideRules} onChange={(hideRules) => save({ hideRules })} isDisabled={!canChange || saving}>
          Hide the rules
        </Switch>
        <p className="pl-11 text-xs text-on-surface-subtle">Players and Captains are told the rules come later, until you show them or the bingo goes {STAGE_LABEL.live}.</p>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}

/**
 * Before moving into the draft: what every team drafts, and who confirming will cut (newest first), from the bingo's
 * draft cuts setting. Unlike everywhere else (where mods still have time to change it), said plainly: this is the step
 * that cuts them.
 */
function DraftCutsPreview({ cuts, bingo }: { cuts: ReturnType<typeof useDraftCuts>; bingo: Bingo }) {
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
        </Notice>
      )}
    </div>
  );
}

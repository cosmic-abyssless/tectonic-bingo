import type { ProofModel } from "../../../headless/types";
import { Badge } from "../../../core/ui/Card";
import { Button } from "../../../core/ui/Button";
import { ImageIcon } from "../../../core/ui/icons";
import { canPostProof, DEFAULT_PROOF_MESSAGE, PROOF_STATUS_TEXT, PROOF_STATUS_TONE } from "../../../core/board/proof";

/**
 * "Proof screenshot needed" (CONTEXT.md "Proof screenshot"): on a Tile (Tile-wide) or one Task. Shows the Admin's message
 * (or a default one), the viewer's own status, and a button opening the Submit flow on posting one.
 */
export function ProofNeeded({ proof, onPost, className }: { proof: ProofModel; onPost?: () => void; className?: string }) {
  const approved = proof.status === "approved";
  const showPost = !!onPost && canPostProof(proof.status);
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${approved ? "border-ok/40 bg-ok/5" : "border-warn/40 bg-warn/5"} ${className ?? ""}`}>
      <div className="flex items-start gap-2">
        <ImageIcon size={16} className={`mt-0.5 shrink-0 ${approved ? "text-ok" : "text-warn"}`} />
        <div className="min-w-0">
          <p className="font-medium text-on-surface">Proof screenshot needed</p>
          <p className="text-xs text-on-surface-muted">{proof.note ?? DEFAULT_PROOF_MESSAGE}</p>
        </div>
      </div>
      {(proof.status || showPost) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          {proof.status && <Badge tone={PROOF_STATUS_TONE[proof.status]}>{PROOF_STATUS_TEXT[proof.status]}</Badge>}
          {showPost && (
            <Button size="sm" onPress={onPost}>
              Post Proof screenshot
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

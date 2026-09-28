import type { ProofModel } from "../../../headless/types";
import { canPostProof, PROOF_STATUS_TEXT, PROOF_STATUS_TONE } from "../../../core/board/proof";
import { CaptionBox, InkTag } from "../ui/CaptionBox";
import { ComicButton } from "../ui/ComicButton";
import { useComic } from "../ui/useComic";

/**
 * "Proof screenshot needed" (CONTEXT.md "Proof screenshot") as a blue caption: on the issue's first page (Tile-wide)
 * or a part's page. The Admin's note on what to show, the viewer's own status, and a button to post one.
 */
export function ProofNeeded({ proof, onPost, className }: { proof: ProofModel; onPost?: () => void; className?: string }) {
  const { colors } = useComic();
  const fill = { warn: colors.WARN, info: colors.BLUE, ok: colors.OK, danger: colors.RED };
  return (
    <CaptionBox tone="blue" title="Proof screenshot needed" className={className}>
      <p className="text-sm leading-snug" style={{ color: colors.INK_BODY }}>
        {proof.note ? `Before your drops count, show ${proof.note}.` : "Before your drops count, show the starting state."}
      </p>
      {(proof.status || (onPost && canPostProof(proof.status))) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {proof.status && (
            <InkTag fill={fill[PROOF_STATUS_TONE[proof.status]]} color={colors.ON_LOUD}>
              {PROOF_STATUS_TEXT[proof.status]}
            </InkTag>
          )}
          {onPost && canPostProof(proof.status) && (
            <ComicButton size="sm" onPress={onPost}>
              Post proof
            </ComicButton>
          )}
        </div>
      )}
    </CaptionBox>
  );
}

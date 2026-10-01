import { TextTooltip } from "../../../core/ui/Tooltip";
import { ComicButton } from "../ui/ComicButton";

/**
 * The page's primary action. Rendered in the masthead on desktop and beside
 * the team banner on phones (each hides itself with `className`), so it's
 * one component with one set of SFX/tilt. With `restricted` (a Restriction
 * takes submitting), it's there but disabled, saying why.
 */
export function SubmitButton({ onPress, className, restricted }: { onPress: () => void; className?: string; restricted?: string | null }) {
  if (restricted) {
    return (
      <TextTooltip text={restricted}>
        <span tabIndex={0} aria-label={`Can't submit. ${restricted}`} className={`outline-none focus-visible:ring-2 focus-visible:ring-accent ${className ?? ""}`}>
          <ComicButton size="sm" variant="primary" tilt={1.5} isDisabled>
            Submit
          </ComicButton>
        </span>
      </TextTooltip>
    );
  }
  return (
    <ComicButton size="sm" variant="primary" tilt={1.5} sfx={{ text: "SUBMIT!", size: 130 }} onPress={onPress} className={className} data-tutorial="submit">
      Submit
    </ComicButton>
  );
}

import { ComicButton } from "../ui/ComicButton";

/**
 * The page's primary action. Rendered in the masthead on desktop and beside
 * the team banner on phones (each hides itself with `className`), so it's
 * one component with one set of SFX/tilt.
 */
export function SubmitButton({ onPress, className }: { onPress: () => void; className?: string }) {
  return (
    <ComicButton size="sm" variant="primary" tilt={1.5} sfx={{ text: "SUBMIT!", size: 130 }} onPress={onPress} className={className}>
      Submit
    </ComicButton>
  );
}

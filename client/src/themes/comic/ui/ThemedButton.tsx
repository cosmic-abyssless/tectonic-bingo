import type { ButtonProps } from "../../../core/ui/Button";
import { ComicButton } from "./ComicButton";

/**
 * The comic theme's Button slot: every core Button on a comic page (dialogs, the draft room, forms) as an ink button,
 * core's variants and sizes mapped straight onto ComicButton's. No sound-effect burst: those are for the masthead and
 * the theme's own calls to action, not every Cancel.
 */
export function ThemedButton({ variant = "secondary", size = "md", ...props }: ButtonProps) {
  return <ComicButton variant={variant} size={size} sfx={false} {...props} />;
}

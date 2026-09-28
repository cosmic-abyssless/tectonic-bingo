import type { SuperlativeGroupBoxProps } from "../../../core/superlatives/SuperlativeChrome";
import { ToneBox } from "./tones";

/** One Superlative category as a yellow ToneBox (as a Title group is), the category's name on its tag. */
export function ComicSuperlativeGroupBox({ name, children }: SuperlativeGroupBoxProps) {
  return (
    <ToneBox tone="yellow" label={name}>
      {children}
    </ToneBox>
  );
}

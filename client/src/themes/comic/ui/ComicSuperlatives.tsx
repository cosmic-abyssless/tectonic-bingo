import type { SuperlativeGroupBoxProps } from "../../../core/superlatives/SuperlativeChrome";
import { CaptionBox } from "./CaptionBox";

/** One Superlative category as a comic caption box, the category's name as its Bangers title. */
export function ComicSuperlativeGroupBox({ name, children }: SuperlativeGroupBoxProps) {
  return <CaptionBox title={name}>{children}</CaptionBox>;
}

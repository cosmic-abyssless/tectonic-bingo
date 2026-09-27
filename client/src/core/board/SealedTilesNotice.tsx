import { Link } from "react-router-dom";
import { Notice } from "../ui/Card";
import { EyeOffIcon } from "../ui/icons";

/**
 * A Moderator's reminder, above the board, that Players and Captains can't open the Tiles right now (CONTEXT.md
 * "Sealed Tiles"), with the way to the setting: the switches under the stage controls, at the top of the mod panel.
 */
export function SealedTilesNotice({ slug }: { slug: string }) {
  return (
    <Notice tone="info" icon={<EyeOffIcon />} className="mb-4">
      <strong>Tiles are sealed for Players.</strong> They see each Tile's art, name and Category, and can't open it.{" "}
      <Link to={`/b/${slug}/mod`} className="font-medium text-on-surface underline underline-offset-2">
        Change in the mod panel
      </Link>
    </Notice>
  );
}

import { Link } from "react-router-dom";
import { useCan } from "../../headless/permissions";
import { Notice } from "../ui/Card";
import { EyeOffIcon } from "../ui/icons";

/**
 * A Moderator's reminder, above the board, that Players and Captains can't open the Tiles right now (CONTEXT.md
 * "Sealed Tiles"), with the way to the setting for an Admin: the Settings tab of the mod panel, which only Admins see.
 */
export function SealedTilesNotice({ slug }: { slug: string }) {
  const administer = useCan("administer_bingo", slug);
  return (
    <Notice tone="info" icon={<EyeOffIcon />} className="mb-4">
      <strong>Tiles are sealed for Players.</strong> They see each Tile's art, name and Category, and can't open it.{" "}
      {administer.allowed ? (
        <Link to={`/b/${slug}/mod?tab=settings`} className="font-medium text-on-surface underline underline-offset-2">
          Change in Settings
        </Link>
      ) : (
        "An Admin can change this in Settings."
      )}
    </Notice>
  );
}

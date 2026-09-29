import { useNavigate } from "react-router-dom";
import { Button } from "../../../core/ui/Button";
import { Badge } from "../../../core/ui/Card";
import { ShieldIcon } from "../../../core/ui/icons";

/** The header's way into the mod panel, with the pending count; only a shield (and the count) on a phone. */
export function ModPanelButton({ slug, pendingCount }: { slug: string; pendingCount: number }) {
  const navigate = useNavigate();
  return (
    <Button size="sm" onPress={() => navigate(`/b/${slug}/mod`)}>
      <ShieldIcon className="md:hidden" />
      <span className="max-md:sr-only">Mod panel</span>
      {pendingCount > 0 && (
        <Badge tone="warn" className="num -my-1">
          {pendingCount}
        </Badge>
      )}
    </Button>
  );
}

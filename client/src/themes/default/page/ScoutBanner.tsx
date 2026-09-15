import { Button } from "../../../core/ui/Button";
import { Notice } from "../../../core/ui/Card";
import { StarIcon } from "../../../core/ui/icons";

export function ScoutBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <Notice tone="info" icon={<StarIcon />} className="mx-auto mb-6 max-w-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <strong>Scout the signups.</strong> Star and note players now so your picks are ready when the draft starts.
        </span>
        <Button size="sm" variant="primary" onPress={onOpen}>
          Open scouting room
        </Button>
      </div>
    </Notice>
  );
}

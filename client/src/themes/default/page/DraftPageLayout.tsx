import { useNavigate } from "react-router-dom";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Button } from "../../../core/ui/Button";
import { DraftRoom } from "../../../core/draft/DraftRoom";

export function DraftPageLayout({ slug, bingoName, isMod }: { slug: string; bingoName: string; isMod: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader back={{ to: `/b/${slug}`, label: "Back to bingo" }} title="Draft" subtitle={bingoName}>
        {isMod && (
          <Button size="sm" onPress={() => navigate(`/b/${slug}/mod`)}>
            Mod panel
          </Button>
        )}
      </AppHeader>
      <DraftRoom slug={slug} />
    </div>
  );
}

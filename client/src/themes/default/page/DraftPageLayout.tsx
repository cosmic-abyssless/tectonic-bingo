import { useNavigate } from "react-router-dom";
import { useBingoHeader } from "../../../headless";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Button } from "../../../core/ui/Button";
import { DraftRoom } from "../../../core/draft/DraftRoom";

export function DraftPageLayout({ slug, bingoName, isMod }: { slug: string; bingoName: string; isMod: boolean }) {
  const navigate = useNavigate();
  const header = useBingoHeader(slug);
  // During the draft stage the board sends you straight back here, so there's no going "back to bingo" then.
  const back =
    header?.stage === "draft" ? (header.canSeeAllBingos ? { to: "/", label: "All bingos" } : undefined) : { to: `/b/${slug}`, label: "Back to bingo" };
  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader back={back} title="Draft" subtitle={bingoName}>
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

import { useState } from "react";
import { useBingoHeader } from "../../../headless";
import { DraftRoom } from "../../../core/draft/DraftRoom";
import { useSlot } from "../../context";
import { ComicPage } from "../fx/ComicPage";
import { Masthead } from "./Masthead";

/**
 * The draft room under the same masthead as the board, its back arrow returning to the board — except during the draft
 * stage, when the board sends you straight back here: then it's the masthead's usual one (all bingos, for admins).
 */
export function DraftPageLayout({ slug }: { slug: string; bingoName: string; isMod: boolean }) {
  const header = useBingoHeader(slug);
  const [rulesOpen, setRulesOpen] = useState(false);
  const RulesDialog = useSlot("RulesDialog");
  return (
    <ComicPage>
      {header && (
        <Masthead slug={slug} header={header} back={header.stage === "draft" ? undefined : { to: `/b/${slug}`, label: "Back to bingo" }} onShowRules={() => setRulesOpen(true)} />
      )}
      <DraftRoom slug={slug} />
      <RulesDialog isOpen={rulesOpen} markdown={header?.rulesMarkdown ?? ""} onClose={() => setRulesOpen(false)} />
    </ComicPage>
  );
}

import { useEffect, useState } from "react";
import { motion, useReducedMotion, useScroll } from "motion/react";
import type { WrappedArtFrames } from "@bingo/shared";
import { useBingoHeader, useBingoMenuEntries, useWrappedModel } from "../../../headless";
import type { WrappedSectionModel } from "../../../headless/types";
import { AppHeader } from "../../../core/ui/AppHeader";
import { Badge } from "../../../core/ui/Card";
import { Button } from "../../../core/ui/Button";
import { ChevronDownIcon } from "../../../core/ui/icons";
import { WRAPPED_CARDS_ID } from "../../../core/wrapped/ShareCards";
import { StickerArt } from "../../../core/wrapped/StickerArt";
import { useSlot } from "../../context";
import { ModPanelButton } from "../page/ModPanelButton";

/**
 * Wrapped's page: the story's sections one after another, each through its own slot, under a thin bar that fills as
 * the viewer scrolls. On a wider screen a column of dots down the side names each section and jumps to it, and the
 * side images take turns beside the sections, alternating left and right.
 */
export function WrappedPageLayout() {
  const wrapped = useWrappedModel();
  const { scrollYProgress } = useScroll();
  const active = useActiveSection(wrapped.sections.map((s) => s.id));
  const reduceMotion = useReducedMotion();
  const header = useBingoHeader(wrapped.slug);
  const menuEntries = useBingoMenuEntries(wrapped.slug, header);
  const { outroReached } = wrapped.actions;
  useEffect(() => {
    if (active === "outro") outroReached();
  }, [active, outroReached]);
  // Back again, having seen it all: offer a way straight to the share cards, until they're on screen.
  const outro = wrapped.sections.find((s) => s.section.kind === "outro")?.section;
  const offerJump = wrapped.outroReachedBefore && outro?.kind === "outro" && outro.cards.length > 0 && active !== "outro";

  const WrappedIntro = useSlot("WrappedIntro");
  const WrappedYou = useSlot("WrappedYou");
  const WrappedDuo = useSlot("WrappedDuo");
  const WrappedCaptain = useSlot("WrappedCaptain");
  const WrappedModerator = useSlot("WrappedModerator");
  const WrappedTeam = useSlot("WrappedTeam");
  const WrappedBingo = useSlot("WrappedBingo");
  const WrappedOutro = useSlot("WrappedOutro");

  const render = (section: WrappedSectionModel) => {
    switch (section.kind) {
      case "intro":
        return <WrappedIntro section={section} preview={wrapped.preview} />;
      case "you":
        return <WrappedYou section={section} />;
      case "duo":
        return <WrappedDuo section={section} />;
      case "captain":
        return <WrappedCaptain section={section} />;
      case "moderator":
        return <WrappedModerator section={section} />;
      case "team":
        return <WrappedTeam section={section} />;
      case "bingo":
        return <WrappedBingo section={section} />;
      case "outro":
        return <WrappedOutro section={section} preview={wrapped.preview} onRewind={wrapped.actions.goToRewind} onBoard={wrapped.actions.goToBoard} />;
    }
  };

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader
        title="Wrapped"
        subtitle={wrapped.publishedLabel ?? wrapped.bingoName}
        menuEntries={menuEntries}
        controls={wrapped.preview && <Badge tone="warn">Preview</Badge>}
      >
        {header?.isMod && <ModPanelButton slug={wrapped.slug} pendingCount={header.pendingCount} />}
      </AppHeader>
      <motion.div aria-hidden className="fixed inset-x-0 top-0 z-50 h-1 origin-left bg-on-surface" style={{ scaleX: scrollYProgress }} />

      <nav aria-label="Wrapped sections" className="fixed top-1/2 right-3 z-40 hidden -translate-y-1/2 flex-col gap-3 md:flex">
        {wrapped.sections.map((s) => (
          <a key={s.id} href={`#wrapped-${s.id}`} className="group flex items-center justify-end gap-2" aria-current={active === s.id ? "true" : undefined}>
            <span className={`text-xs transition-opacity ${active === s.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>{s.label}</span>
            <span className={`size-2.5 rounded-full border border-on-surface-muted transition-colors ${active === s.id ? "bg-on-surface" : "bg-transparent"}`} />
          </a>
        ))}
      </nav>

      {offerJump && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <Button
            variant="primary"
            className="pointer-events-auto shadow-lg"
            onPress={() => document.getElementById(WRAPPED_CARDS_ID)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })}
          >
            Jump to the share cards
            <ChevronDownIcon />
          </Button>
        </div>
      )}

      <main>
        {wrapped.sections.map((s, i) => (
          <div key={s.id} id={`wrapped-${s.id}`} data-wrapped-section={s.id} className="relative scroll-mt-16">
            {wrapped.sideArt.length > 0 && <SideArt frames={wrapped.sideArt[i % wrapped.sideArt.length]!} side={i % 2 === 0 ? "left" : "right"} />}
            {render(s.section)}
          </div>
        ))}
      </main>
    </div>
  );
}

/** The section nearest the middle of the screen. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join(",");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.wrappedSection ?? null);
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    document.querySelectorAll("[data-wrapped-section]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);
  return active;
}

/**
 * One side image beside a section: large, in the margin the story's centred column leaves, and stuck in view while
 * the section scrolls past. Wide screens only: a phone has no margin to spare.
 */
function SideArt({ frames, side }: { frames: WrappedArtFrames; side: "left" | "right" }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-y-0 hidden w-[calc((100vw-48rem)/2-3rem)] max-w-sm xl:block ${side === "left" ? "left-4" : "right-12"}`}>
      <motion.div className="sticky top-[15vh] h-[70vh]" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ amount: 0.3 }} transition={{ duration: 0.5 }}>
        <StickerArt frames={frames} className="size-full" phase={side === "left" ? 0 : 0.5} />
      </motion.div>
    </div>
  );
}

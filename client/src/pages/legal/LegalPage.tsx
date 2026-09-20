import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "../../core/ui/AppHeader";
import { Card } from "../../core/ui/Card";
import { Markdown } from "../../core/ui/Markdown";
import { PRIVACY_MD, TERMS_MD } from "./legalContent";

// Public (no login needed): Discord and anyone else can be given these links.
function LegalPage({ title, markdown }: { title: string; markdown: string }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Tectonic Bingo`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="min-h-dvh bg-background text-on-surface">
      <AppHeader title="Tectonic Bingo" back={{ to: "/", label: "Back" }} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Card className="p-6 sm:p-8">
          <Markdown>{markdown}</Markdown>
        </Card>
        <nav aria-label="Legal" className="mt-4 flex justify-center gap-4 text-xs text-on-surface-subtle">
          <Link to="/terms" className="underline-offset-2 hover:text-on-surface hover:underline">
            Terms of Service
          </Link>
          <Link to="/privacy" className="underline-offset-2 hover:text-on-surface hover:underline">
            Privacy Policy
          </Link>
        </nav>
      </main>
    </div>
  );
}

export const TermsPage = () => <LegalPage title="Terms of Service" markdown={TERMS_MD} />;
export const PrivacyPage = () => <LegalPage title="Privacy Policy" markdown={PRIVACY_MD} />;

import ReactMarkdown, { type Components } from "react-markdown";

const components: Components = {
  h1: (p) => <h1 className="mt-4 mb-2 text-lg font-semibold text-on-surface first:mt-0" {...p} />,
  h2: (p) => <h2 className="mt-4 mb-2 text-base font-semibold text-on-surface first:mt-0" {...p} />,
  h3: (p) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-on-surface first:mt-0" {...p} />,
  p: (p) => <p className="mb-3 text-sm leading-relaxed text-on-surface-muted last:mb-0" {...p} />,
  ul: (p) => <ul className="mb-3 list-outside list-disc space-y-1 pl-5 text-sm text-on-surface-muted" {...p} />,
  ol: (p) => <ol className="mb-3 list-outside list-decimal space-y-1 pl-5 text-sm text-on-surface-muted" {...p} />,
  a: (p) => <a className="text-on-surface underline decoration-outline-strong underline-offset-2 hover:decoration-on-surface" target="_blank" rel="noreferrer" {...p} />,
  strong: (p) => <strong className="font-semibold text-on-surface" {...p} />,
  code: (p) => <code className="rounded-sm bg-background px-1 py-0.5 font-mono text-xs text-on-surface" {...p} />,
  blockquote: (p) => <blockquote className="mb-3 border-l-2 border-outline-strong pl-3 text-on-surface-muted italic" {...p} />,
  hr: () => <hr className="my-4 border-outline" />,
};

// Renders admin-authored rules/description markdown. Replaces v1's
// hardcoded-prose RulesModal — content now lives in bingos.rulesMarkdown.
export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
}

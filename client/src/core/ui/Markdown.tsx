import ReactMarkdown, { type Components } from "react-markdown";

const components: Components = {
  h1: (p) => <h1 className="mt-4 mb-2 text-lg font-semibold text-fg first:mt-0" {...p} />,
  h2: (p) => <h2 className="mt-4 mb-2 text-base font-semibold text-fg first:mt-0" {...p} />,
  h3: (p) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-fg first:mt-0" {...p} />,
  p: (p) => <p className="mb-3 text-sm leading-relaxed text-fg-muted last:mb-0" {...p} />,
  ul: (p) => <ul className="mb-3 list-outside list-disc space-y-1 pl-5 text-sm text-fg-muted" {...p} />,
  ol: (p) => <ol className="mb-3 list-outside list-decimal space-y-1 pl-5 text-sm text-fg-muted" {...p} />,
  a: (p) => <a className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg" target="_blank" rel="noreferrer" {...p} />,
  strong: (p) => <strong className="font-semibold text-fg" {...p} />,
  code: (p) => <code className="rounded-sm bg-bg px-1 py-0.5 font-mono text-xs text-fg" {...p} />,
  blockquote: (p) => <blockquote className="mb-3 border-l-2 border-line-strong pl-3 text-fg-muted italic" {...p} />,
  hr: () => <hr className="my-4 border-line" />,
};

// Renders admin-authored rules/description markdown. Replaces v1's
// hardcoded-prose RulesModal — content now lives in bingos.rulesMarkdown.
export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
}

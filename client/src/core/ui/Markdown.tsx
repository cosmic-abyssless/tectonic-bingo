import ReactMarkdown, { type Components } from "react-markdown";

const components: Components = {
  h1: (p) => <h1 className="text-xl font-bold text-white mt-4 mb-2 first:mt-0" {...p} />,
  h2: (p) => <h2 className="text-lg font-bold text-white mt-4 mb-2 first:mt-0" {...p} />,
  h3: (p) => <h3 className="text-base font-bold text-white mt-3 mb-1.5 first:mt-0" {...p} />,
  p: (p) => <p className="text-slate-300 text-sm leading-relaxed mb-3 last:mb-0" {...p} />,
  ul: (p) => <ul className="list-disc list-outside pl-5 text-slate-300 text-sm space-y-1 mb-3" {...p} />,
  ol: (p) => <ol className="list-decimal list-outside pl-5 text-slate-300 text-sm space-y-1 mb-3" {...p} />,
  a: (p) => <a className="text-indigo-400 hover:text-indigo-300 underline" target="_blank" rel="noreferrer" {...p} />,
  strong: (p) => <strong className="text-white font-semibold" {...p} />,
  code: (p) => <code className="bg-slate-900 text-amber-300 rounded px-1 py-0.5 text-xs" {...p} />,
  blockquote: (p) => <blockquote className="border-l-2 border-slate-600 pl-3 text-slate-400 italic mb-3" {...p} />,
  hr: () => <hr className="border-slate-700 my-4" />,
};

// Renders admin-authored rules/description markdown. Replaces v1's
// hardcoded-prose RulesModal — content now lives in bingos.rulesMarkdown.
export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
}

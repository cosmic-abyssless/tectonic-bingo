/**
 * The team's Codeword (CONTEXT.md), which every screenshot must show: a small info-toned banner, like the scouting one,
 * beside the header's title while Live and at the top of the Submit flow.
 */
export function CodewordBanner({ codeword }: { codeword: string }) {
  return (
    <div className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-md border border-info/30 bg-info/5 px-2 py-1 text-xs text-info">
      Codeword
      <strong className="truncate font-semibold text-on-surface">{codeword}</strong>
    </div>
  );
}

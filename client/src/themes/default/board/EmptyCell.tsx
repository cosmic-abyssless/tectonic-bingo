export function EmptyCell(_props: { row: number; col: number }) {
  return <div className="aspect-square rounded-md border border-[var(--tile-border)] bg-[var(--tile-empty)]" />;
}

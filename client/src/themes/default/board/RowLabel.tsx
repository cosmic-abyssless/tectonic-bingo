import type { CategoryModel } from "../../../headless/types";

export function RowLabel({ category }: { category: CategoryModel | null }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-[var(--tile-border)] bg-[var(--tile-empty)] px-1.5 text-[11px] font-semibold uppercase tracking-widest text-on-surface-muted"
      style={{
        writingMode: "vertical-lr",
        transform: "rotate(180deg)",
        color: category?.color ?? undefined,
        borderColor: category?.color ? `${category.color}66` : undefined,
      }}
    >
      {category?.label ?? ""}
    </div>
  );
}

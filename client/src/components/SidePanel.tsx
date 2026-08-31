import type { TileSide, TileSideItem } from "../types";

function groupItems(items: TileSideItem[]) {
  const required: TileSideItem[] = [];
  const grouped = new Map<string, TileSideItem[]>();
  for (const item of items) {
    if (!item.optionsGroup) {
      required.push(item);
    } else {
      const list = grouped.get(item.optionsGroup) ?? [];
      list.push(item);
      grouped.set(item.optionsGroup, list);
    }
  }
  return { required, grouped };
}

function ItemProgress({
  item,
  approvedQty,
}: {
  item: TileSideItem;
  approvedQty: number;
}) {
  if (item.quantity <= 1) return null;
  const done = approvedQty >= item.quantity;
  return (
    <span
      className={`font-semibold text-xs tabular-nums ${done ? "text-green-400" : "text-yellow-400"}`}
    >
      {approvedQty}/{item.quantity}
    </span>
  );
}

export function SidePanel({
  side,
  label,
  approvedByItemName,
  submittedItemNames,
  locked,
  complete,
}: {
  side: TileSide;
  label: string;
  approvedByItemName: Map<string, number>;
  submittedItemNames: Set<string>;
  locked?: boolean;
  complete?: boolean;
}) {
  const { required, grouped } = groupItems(side.items);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-bold text-sm">{label}</span>
          {complete && (
            <svg
              className="w-3.5 h-3.5 text-green-400 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {locked && (
            <div className="relative group/lock">
              <svg
                className="w-3.5 h-3.5 text-slate-400 cursor-default"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 hidden group-hover/lock:block bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 shadow-xl z-30 leading-relaxed">
                {side.requiresPartA
                  ? "Part B cannot be submitted until Part A is completed."
                  : "Points for Part B are only awarded after Part A is completed. You can submit for Part B at any time."}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-600" />
              </div>
            </div>
          )}
        </div>
        <span className="text-yellow-400 font-semibold text-sm">
          {side.points} pts
        </span>
      </div>

      <p className="text-slate-300 text-sm leading-relaxed mb-3">
        {side.description}
      </p>

      {required.length > 0 && (
        <ul className="space-y-1 mb-2">
          {required.map((item) => {
            const submitted = submittedItemNames.has(item.itemName);
            const approved = (approvedByItemName.get(item.itemName) ?? 0) > 0;
            return (
              <li
                key={item.id}
                className={`flex items-baseline gap-2 text-sm ${submitted ? "text-slate-500 line-through" : "text-slate-200"}`}
              >
                <span className="text-indigo-400 text-xs">▸</span>
                <ItemProgress
                  item={item}
                  approvedQty={approvedByItemName.get(item.itemName) ?? 0}
                />
                {item.itemName}
                {approved && (
                  <svg
                    className="w-3 h-3 text-green-400 shrink-0 no-underline"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {[...grouped.entries()].map(([group, opts]) => (
        <div key={group} className="mt-2">
          <span className="text-slate-500 text-xs uppercase tracking-wide">
            Choose one:
          </span>
          <ul className="space-y-1 mt-1">
            {opts.map((item) => {
              const submitted = submittedItemNames.has(item.itemName);
              const approved = (approvedByItemName.get(item.itemName) ?? 0) > 0;
              return (
                <li
                  key={item.id}
                  className={`flex items-baseline gap-2 text-sm ${submitted ? "text-slate-500 line-through" : "text-slate-300"}`}
                >
                  <span className="text-slate-500 text-xs">◦</span>
                  <ItemProgress
                    item={item}
                    approvedQty={approvedByItemName.get(item.itemName) ?? 0}
                  />
                  {item.itemName}
                  {approved && (
                    <svg
                      className="w-3 h-3 text-green-400 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {(side.requiresNoDuplicates ||
        side.allowsPreviouslyAcquired ||
        side.allowsPreLoad ||
        side.requiresCompleteSet) && (
        <div className="flex gap-2 flex-wrap mt-3">
          {side.requiresCompleteSet && (
            <span className="text-xs bg-amber-900/40 text-amber-300 border border-amber-600 rounded-full px-2 py-0.5">
              Complete a full set
            </span>
          )}
          {side.requiresNoDuplicates && (
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
              No duplicates
            </span>
          )}
          {side.allowsPreviouslyAcquired && (
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
              Prev. acquired OK
            </span>
          )}
          {side.allowsPreLoad && (
            <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-600 rounded-full px-2 py-0.5">
              Pre-load allowed
            </span>
          )}
        </div>
      )}

      {side.notes && (
        <p className="mt-3 text-xs text-amber-400 border-l-2 border-amber-500 pl-2">
          {side.notes}
        </p>
      )}
    </div>
  );
}

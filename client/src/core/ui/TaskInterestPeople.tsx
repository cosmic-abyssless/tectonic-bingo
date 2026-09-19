import { DialogTrigger, Popover } from "react-aria-components";
import type { TaskInterestModel } from "../../headless/types";
import { UsersIcon } from "./icons";
import { PlayerName } from "../tectonic/PlayerName";

export interface TaskInterestPeopleProps {
  interest: TaskInterestModel;
  /** Max individual names shown inline before collapsing the rest into a trigger */
  maxInline?: number;
  /** Optional theme styling variant */
  variant?: "default" | "comic";
}

export function TaskInterestPeople({
  interest,
  maxInline = 1,
  variant = "default",
}: TaskInterestPeopleProps) {
  const people = interest.people;

  if (people.length === 0) {
    return (
      <span className={variant === "comic" ? "text-xs italic" : "text-sm text-on-surface-subtle"}>
        Unclaimed
      </span>
    );
  }

  const showCount = people.length > maxInline;
  const inlinePeople = showCount ? people.slice(0, maxInline) : people;
  const remainingCount = people.length - maxInline;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      <span className="inline-flex flex-wrap items-center gap-1">
        {inlinePeople.map((p, i) => (
          <span key={p.id}>
            {i > 0 && ", "}
            <PlayerName userId={p.id}>{p.displayName}</PlayerName>
          </span>
        ))}
      </span>

      {showCount && (
        <DialogTrigger>
          <button
            type="button"
            className={
              variant === "comic"
                ? "inline-flex items-center gap-1 border-2 border-black bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-black shadow-[1.5px_1.5px_0_#000] transition-transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                : "inline-flex items-center gap-1 rounded-md border border-outline bg-surface-raised px-1.5 py-0.5 text-xs font-medium text-on-surface-muted transition-colors hover:border-outline-strong hover:text-on-surface cursor-pointer"
            }
            aria-label={`${people.length} teammates interested: view full list`}
          >
            <UsersIcon size={12} />
            <span className="num">+{remainingCount}</span>
          </button>
          <Popover
            placement="bottom"
            offset={6}
            className={
              variant === "comic"
                ? "z-[90] min-w-44 max-w-64 border-[3px] border-black bg-white p-3 shadow-[3px_3px_0_#000] outline-none"
                : "overlay-panel z-50 min-w-48 max-w-64 rounded-md border border-outline bg-surface-raised p-3 text-xs shadow-pop outline-none"
            }
          >
            <div className="flex flex-col gap-2">
              <div
                className={
                  variant === "comic"
                    ? "border-b-2 border-black/20 pb-1 text-xs font-black uppercase tracking-wider text-black"
                    : "border-b border-outline pb-1 font-semibold text-on-surface"
                }
              >
                On this task ({people.length})
              </div>
              <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {people.map((p) => (
                  <li key={p.id} className="truncate">
                    <PlayerName userId={p.id} className="font-medium">
                      {p.displayName}
                    </PlayerName>
                  </li>
                ))}
              </ul>
            </div>
          </Popover>
        </DialogTrigger>
      )}
    </span>
  );
}

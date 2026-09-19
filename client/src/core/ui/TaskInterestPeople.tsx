import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { TaskInterestModel } from "../../headless/types";
import { UsersIcon } from "./icons";
import { PlayerName } from "../tectonic/PlayerName";
import { COMIC_FONT } from "../../themes/comic/font";

export interface TaskInterestPeopleProps {
  interest: TaskInterestModel;
  /** Optional theme styling variant */
  variant?: "default" | "comic";
}

export function TaskInterestPeople({
  interest,
  variant = "default",
}: TaskInterestPeopleProps) {
  const people = interest.people;
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const count = people.length;

  useEffect(() => {
    if (!isOpen) return;

    function updatePosition() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverEl = popoverRef.current;
      const popoverWidth = popoverEl ? popoverEl.offsetWidth : 192;
      const popoverHeight = popoverEl ? popoverEl.offsetHeight : 160;

      let top = rect.bottom + 6;
      let left = rect.left;

      // Keep within viewport boundaries
      if (left + popoverWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - popoverWidth - 12);
      }
      if (top + popoverHeight > window.innerHeight - 12 && rect.top - popoverHeight - 6 > 0) {
        top = rect.top - popoverHeight - 6;
      }

      setCoords({ top, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (count === 0) {
    return (
      <span className={variant === "comic" ? "text-xs italic" : "text-sm text-on-surface-subtle"}>
        Unclaimed
      </span>
    );
  }

  const isComic = variant === "comic";

  return (
    <span className="inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={
          isComic
            ? "inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-white px-2 py-0.5 text-xs font-bold leading-none text-black shadow-[2px_2px_0_#000] transition-transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer select-none"
            : "inline-flex items-center gap-1.5 rounded-full border border-outline bg-surface-raised px-2 py-0.5 text-xs font-medium text-on-surface-muted transition-colors hover:border-outline-strong hover:text-on-surface cursor-pointer select-none"
        }
        style={isComic ? { fontFamily: COMIC_FONT } : undefined}
        aria-expanded={isOpen}
        aria-label={`${count} ${count === 1 ? "teammate" : "teammates"} interested: view list`}
      >
        <UsersIcon size={12} className={isComic ? "text-black" : "text-on-surface-subtle"} />
        <span className="num font-semibold">{count}</span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 9999,
            }}
            className={
              isComic
                ? "min-w-48 max-w-64 border-[3px] border-black bg-white p-3 shadow-[4px_4px_0_#000] text-black text-xs"
                : "overlay-panel min-w-48 max-w-64 rounded-md border border-outline bg-surface-raised p-3 text-xs shadow-pop"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2">
              <div
                className={
                  isComic
                    ? "border-b-2 border-black/20 pb-1 text-xs font-black uppercase tracking-wider text-black"
                    : "border-b border-outline pb-1 font-semibold text-on-surface"
                }
                style={isComic ? { fontFamily: COMIC_FONT } : undefined}
              >
                Interested teammates ({count})
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
          </div>,
          document.body
        )}
    </span>
  );
}

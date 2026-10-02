import { createContext, useContext, useSyncExternalStore, type CSSProperties } from "react";
import type { ComicColors } from "../board/colors";
import type { BookController, BookSnapshot } from "./BookController";

/** The book the page is running, for what is drawn inside it (the contents page) to read where it is and turn to a section. */
export const BookContext = createContext<BookController | null>(null);

export function useBook(): { controller: BookController; snapshot: BookSnapshot } {
  const controller = useContext(BookContext);
  if (!controller) throw new Error("useBook must be used within the comic Wrapped page");
  return { controller, snapshot: useSyncExternalStore(controller.subscribe, controller.getSnapshot) };
}

/**
 * The app's colour tokens (the ones Tailwind's `text-on-surface`, `bg-surface` and `border-outline` read) set to the page
 * palette, for everything printed on the book's paper: a section built from the default theme's classes then reads as
 * ink on paper, in light and dark alike, instead of as the page's own yellow or night-blue chrome.
 */
export function pageTokenVars(page: ComicColors): CSSProperties {
  return {
    "--color-background": page.PAPER,
    "--color-surface": page.PAPER_RAISED,
    "--color-surface-raised": page.PAPER_ALT,
    "--color-surface-hover": page.PAPER_ALT,
    "--color-outline": page.RULE,
    "--color-outline-strong": page.LINE,
    "--color-on-surface": page.INK,
    "--color-on-surface-muted": page.INK_SUBTLE,
    "--color-on-surface-subtle": page.INK_SUBTLE,
  } as CSSProperties;
}

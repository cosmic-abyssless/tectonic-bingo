import { createContext, useContext } from "react";

/**
 * Whether what's below is drawn inside another react-aria modal (the board editor's "Preview as Players"). An overlay of
 * its own that isn't a react-aria one (the comic Tile's book, comic/board/bookModal.ts) has to mark itself a react-aria
 * top layer there, or that modal hides it from the page, keeps focus out of it and closes on a click in it. Nowhere
 * else: react-aria never counts a click on a top layer as outside, so a popover opened over it wouldn't close on one.
 */
export const InsideModalContext = createContext(false);

export function useInsideModal(): boolean {
  return useContext(InsideModalContext);
}

import { useEffect, useState } from "react";

// How many comic modals are on screen right now. A modal registers itself while it is
// mounted, so this must be called from something that only exists while the modal is
// open (react-aria's ModalOverlay renders nothing when closed — the always-mounted
// ComicDialog wrapper itself would count as open forever).
let open = 0;

/**
 * How many other modals were already open when this one mounted: 0 for the first, 1 for one
 * opened on top of it, and so on. Fixed for the life of the modal. The first modal gets the
 * sunbeams; ones stacked on it only dim what's behind, since two sets of beams layered on
 * each other just read as noise.
 */
export function useModalDepth(): number {
  const [depth] = useState(() => open);
  useEffect(() => {
    open++;
    return () => {
      open--;
    };
  }, []);
  return depth;
}

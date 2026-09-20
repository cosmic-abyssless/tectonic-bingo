import { useEffect, useState } from "react";

/** The element's current height in pixels (0 until it exists), kept up to date as it resizes. */
export function useElementHeight(element: Element | null): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!element) return;
    const measure = () => setHeight(Math.round(element.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return height;
}

// The animation engine behind the `m` components outside the comic theme (core/**, the default theme), loaded by
// App's LazyMotion after first paint rather than with the board. The comic theme uses the full `motion` components,
// which carry their own, so it doesn't wait on this.
export { domAnimation as default } from "motion/react";

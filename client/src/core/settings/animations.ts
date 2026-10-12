import { useLayoutEffect, useSyncExternalStore } from "react";
import { MotionGlobalConfig, useReducedMotion as useDeviceReducedMotion } from "motion/react";
import type { AnimationsSetting } from "@bingo/shared";
import { useUserSettings } from "../../api/userSettingsApi";

// The viewer's Animations setting (shared userSettings.ts) lives on <html data-animations> once useSyncAnimations has
// put it there (absent at All), so anything can read it without the account's settings query.
const ATTRIBUTE = "data-animations";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTRIBUTE] });
  return () => observer.disconnect();
}
const readSetting = () => (document.documentElement.getAttribute(ATTRIBUTE) as AnimationsSetting | null) ?? "all";

/** The viewer's Animations setting, as applied to the page. */
export function useAnimationsSetting(): AnimationsSetting {
  return useSyncExternalStore(subscribe, readSetting, () => "all");
}

/**
 * Whether to leave motion out: the device asks for reduced motion, or the viewer turned Animations Off. Use this, not
 * motion's own useReducedMotion, which only knows the device's.
 */
export function useReducedMotion(): boolean {
  const device = useDeviceReducedMotion();
  return useAnimationsSetting() === "off" || !!device;
}

/**
 * Applies the viewer's Animations setting to the whole page; call once at the app root. CSS reads
 * <html data-animations> (index.css: Reduced stops the spinning backgrounds, Off every CSS animation and transition),
 * and Off has every motion/react animation jump straight to where it ends.
 */
export function useSyncAnimations(): void {
  const setting = useUserSettings().animations;
  // Before paint: a page that loads at Off (from the settings this browser remembers) never shows a frame of motion.
  useLayoutEffect(() => {
    if (setting === "all") document.documentElement.removeAttribute(ATTRIBUTE);
    else document.documentElement.setAttribute(ATTRIBUTE, setting);
    MotionGlobalConfig.skipAnimations = setting === "off";
  }, [setting]);
}

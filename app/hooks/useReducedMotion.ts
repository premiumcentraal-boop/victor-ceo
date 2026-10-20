import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  try {
    const mql = window.matchMedia(QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  } catch {
    return () => {};
  }
}

function getSnapshot() {
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** True when the visitor has asked for less motion. Updates live if they change the setting. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
